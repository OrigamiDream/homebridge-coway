import {API} from "homebridge";
import {CowayPlatform} from "./coway-platform";
import {Constants} from "./enumerations";

export = (api: API) => {
    api.registerPlatform(Constants.PLATFORM_NAME, CowayPlatform);
};