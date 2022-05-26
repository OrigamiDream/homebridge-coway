import {AccessoryInterface} from "../accessory";
import {ButtonLock, ColdWaterLock, HotWaterLock} from "./enumerations";

export interface DriverWaterPurifierInterface extends AccessoryInterface {
    controlInfo: ControlInfo
}

export interface ControlInfo {
    coldWaterLock: ColdWaterLock
    hotWaterLock: HotWaterLock
    buttonLock: ButtonLock
}