export enum Field {
    POWER = "0001",
    MODE = "0002",
    FAN_SPEED = "0003",
    LIGHT = "0007",
    AIR_QUALITY = "002F",
    LIGHT_BRIGHTNESS = "0031",
}

export enum Mode {
    DISABLED = "0",
    AUTO_DRIVING = "1",
    SILENT = "2",
    TURBO = "5",
    MY_PET = "9"
}

export enum FanSpeed {
    MINIMUM = "0",
    WEAK = "1",
    MEDIUM = "2",
    STRONG = "3",
    TURBO = "5",
    MY_PET = "6",
    SHUTDOWN = "99"
}

export enum Light {
    ON = "0",
    OFF = "3"
}

export enum Power {
    ON = "1",
    OFF = "0"
}

export enum AirQuality {
    EXCELLENT = 1,
    GOOD = 2,
    FAIR = 3,
    INFERIOR = 4
}