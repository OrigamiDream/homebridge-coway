import {API, APIEvent, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig} from "homebridge";
import {AccessToken, CowayService} from "./coway";
import {CowayConfig} from "./interfaces/config";
import {Accessory, AccessoryInterface} from "./accessories/accessory";
import {Constants, DeviceType, Endpoint} from "./enumerations";
import {MarvelAirPurifier} from "./accessories/air-purifiers/marvel-air-purifier";
import {DriverWaterPurifier} from "./accessories/water-purifiers/driver-water-purifier";
import {Device} from "./interfaces/device";

type AccessoryTypes =
    typeof DriverWaterPurifier |
    typeof MarvelAirPurifier;

export class CowayPlatform implements DynamicPlatformPlugin {

    private readonly service: CowayService;
    private readonly config?: CowayConfig;
    private readonly accessories: Accessory<AccessoryInterface>[] = [];
    private readonly accessoryRegistry: { [deviceType in DeviceType]: AccessoryTypes } = {
        [DeviceType.DRIVER_WATER_PURIFIER]: DriverWaterPurifier,
        [DeviceType.MARVEL_AIR_PURIFIER]: MarvelAirPurifier
    };

    private accessToken?: AccessToken = undefined;

    constructor(private readonly log: Logging,
                config: PlatformConfig,
                private readonly api: API) {

        this.service = new CowayService(this.log);
        this.config = this.parseCowayConfig(config);

        if(!this.config) {
            this.log.warn("The coway config is not yet configured.");
            return;
        }

        api.on(APIEvent.DID_FINISH_LAUNCHING, async () => {
            this.accessToken = await this.service.signIn(this.config);

            await this.configureCowayDevices();
            await this.refreshDevicesParallel();

            this.enqueueDeviceRefreshInterval();
        });
    }

    enqueueDeviceRefreshInterval() {
        setInterval(async () => {
            await this.refreshDevicesParallel();
        }, 5 * 1000);
    }

    async refreshDevicesParallel() {
        const queues = [];
        for(const accessory of this.accessories) {
            for(const endpoint of accessory.getEndpoints()) {
                queues.push(accessory.retrieveDeviceState(endpoint));
            }
        }
        const responses = await Promise.all(queues);
        for(const accessory of this.accessories) {
            const awaits = responses.splice(0, accessory.getEndpoints().length);
            await accessory.refresh(accessory.zipEndpointResponses(awaits));
        }
    }

    parseCowayConfig(config: PlatformConfig): CowayConfig | undefined {
        for(const key in config) {
            const value = config[key];
            if(value === undefined || !value) {
                return undefined;
            }
        }
        return config as any as CowayConfig;
    }

    configureAccessory(platformAccessory: PlatformAccessory) {
        const context = platformAccessory.context as AccessoryInterface;
        const accessoryType = this.accessoryRegistry[<DeviceType> context.deviceType];
        if(!accessoryType) {
            this.log.warn("Failed to reconfigure %s", platformAccessory.displayName);
            return;
        }
        const accessory = new accessoryType(this.log, this.api, context.deviceInfo, this.service, platformAccessory);
        this.accessories.push(accessory);

        platformAccessory.context.configured = false;
        this.log.info("Configuring cached accessory: %s", platformAccessory.displayName);
    }

    async configureCowayDevices() {
        // retrieve total 100 accessories in once
        const response = await this.service.executePayload(Endpoint.GET_DEVICE_INFO, {
            pageIndex: "0",
            pageSize: "100"
        }, this.accessToken);
        const deviceInfos = response.data.body.deviceInfos;
        if(!deviceInfos.length) {
            this.log.warn("No Coway devices in your account");
            return;
        }
        for(let i = 0; i < deviceInfos.length; i++) {
            const deviceInfo = deviceInfos[i] as Device;
            await this.addAccessory(deviceInfo);
        }

        const accessoriesToRemove = [];
        for(let i = 0; i < this.accessories.length; i++) {
            const accessory = this.accessories[i];
            const platformAccessory = accessory.getPlatformAccessory();
            if(!platformAccessory.context.configured) {
                accessoriesToRemove.push(accessory);
            }
        }
        if(accessoriesToRemove.length) {
            accessoriesToRemove.forEach(accessory => {
                this.log.info('Removing accessory:', accessory.getPlatformAccessory().displayName);
                this.accessories.splice(this.accessories.indexOf(accessory), 1);
            });
            this.api.unregisterPlatformAccessories(Constants.PLUGIN_NAME, Constants.PLATFORM_NAME, accessoriesToRemove.map(accessory => accessory.getPlatformAccessory()));
        }
    }

    async addAccessory(deviceInfo: Device) {
        const deviceType = <DeviceType> deviceInfo.dvcTypeCd;
        const uuid = this.api.hap.uuid.generate(deviceInfo.barcode);
        if(!this.accessories.find(accessory => accessory.getPlatformAccessory().UUID === uuid)) {
            this.log.info("Adding new accessory: %s (%s)", deviceInfo.dvcNick, deviceInfo.prodName);
            const platformAccessory = new this.api.platformAccessory(deviceInfo.dvcNick, uuid);
            const accessoryType = this.accessoryRegistry[deviceType];
            const accessory = new accessoryType(this.log, this.api, deviceInfo, this.service, platformAccessory);

            this.accessories.push(accessory);

            accessory.configureCredentials(this.config!, this.accessToken!);
            await accessory.configure();

            platformAccessory.context.configured = true;

            this.api.registerPlatformAccessories(Constants.PLUGIN_NAME, Constants.PLATFORM_NAME, [ platformAccessory ]);
        } else {
            this.log.info("Restoring existing accessory: %s (%s)", deviceInfo.dvcNick, deviceInfo.prodName);
            for (const accessory of this.accessories.filter(accessory => accessory.getPlatformAccessory().UUID === uuid)) {
                accessory.configureCredentials(this.config!, this.accessToken!);
                await accessory.configure();

                const platformAccessory = accessory.getPlatformAccessory();
                platformAccessory.context.init = false;
                platformAccessory.context.deviceInfo = deviceInfo;
                platformAccessory.context.deviceType = deviceType;
                platformAccessory.context.configured = true;
            }
        }
    }
}