import {AccessoryInterface} from "../accessory";
import {ButtonLock, ColdWaterLock, HotWaterLock, FaucetState} from "./enumerations";

export interface DriverWaterPurifierInterface extends AccessoryInterface {
    controlInfo: ControlInfo;
}

export interface ControlInfo {
    coldWaterLock: ColdWaterLock;
    hotWaterLock: HotWaterLock;
    buttonLock: ButtonLock;
    faucetState: FaucetState;
    flowingMilliliter: number;
}