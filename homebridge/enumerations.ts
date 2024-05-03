import {Field as AirField} from "./accessories/air-purifiers/enumerations";
import {Field as WaterField} from "./accessories/water-purifiers/enumerations";

export type Field = AirField | WaterField;

export enum Constants {
    USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML, like Gecko) Version/10.0 Mobile/14E304 Safari/602.1",
    CLIENT_ID = "cwid-prd-iocare-20240327",
    PLATFORM_NAME = "Coway",
    PLUGIN_NAME = "homebridge-coway"
}

export enum URL {
    NEW_SIGN_IN_URL = "https://id.coway.com/auth/realms/cw-account/protocol/openid-connect/auth",
    NEW_AUTHENTICATE_URL = "https://id.coway.com/auth/realms/cw-account/login-actions/authenticate",
    NEW_IOCARE_REDIRECT_URL = "https://iocare-redirect.iot.coway.com/redirect_bridge.html",
    NEW_IOCARE_API_URL = "https://iocareapi.iot.coway.com/api/v1",
}

export enum IoCareEndpoint {
    GET_ACCESS_TOKEN = "/com/token::CWCC0009",
    GET_USER_DEVICES = "/com/user-devices::CWIG0304",
    GET_DEVICE_CONNECTIONS = "/com/devices-conn::CWIG0607",
    CONTROL_DEVICE = "/com/control-device::CWIG0603",
    REFRESH_TOKEN = "/com/refresh-token::CWCC0010",
}

export enum EndpointPath {
    DEVICES_CONTROL = "/com/devices/{deviceId}/control::CWIG0602",
    AIR_DEVICES_HOME = "/air/devices/{deviceId}/home::CWIA0120",
    AIR_DEVICES_FILTER_INFO = "/air/devices/{deviceId}/filter-info::CWIA0500",
}

export enum DeviceType {
    DRIVER_WATER_PURIFIER = "001",
    MARVEL_AIR_PURIFIER = "004"
}