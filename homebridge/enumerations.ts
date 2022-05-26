import {Field as AirField} from "./accessories/air-purifiers/enumerations";
import {Field as WaterField} from "./accessories/water-purifiers/enumerations";

export type Field = AirField | WaterField;

export enum Constants {
    USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML, like Gecko) Version/10.0 Mobile/14E304 Safari/602.1",
    SERVICE_CODE = "com.coway.IOCareKor",
    CLIENT_ID = "UmVuZXdhbCBBcHA",
    PLATFORM_NAME = "Coway",
    PLUGIN_NAME = "homebridge-coway"
}

export enum URL {
    BASE_URL = "https://iocareapp.coway.com/bizmob.iocare",
    MEMBER_URL = "https://member.coway.com",
    OAUTH_URL = "https://idp.coway.com/oauth2/v1/authorize",
    SIGN_IN_URL = "https://idp.coway.com/user/signin/",
    REDIRECT_URL = "https://iocareapp.coway.com/bizmob.iocare/redirect/redirect.html",
}

export enum Endpoint {
    GET_ACCESS_TOKEN = "CWIL0100",
    GET_DEVICE_INFO = "CWIG0304",
    GET_DEVICE_CONTROL_INFO = "CWIG0602",
    GET_DEVICE_STATUS_INFO = "CWIA0120",
    GET_DEVICE_FILTER_INFO = "CWIA0800",
    SET_DEVICE_CONTROL = "CWIG0603"
}

export enum DeviceType {
    DRIVER_WATER_PURIFIER = "001",
    MARVEL_AIR_PURIFIER = "004"
}