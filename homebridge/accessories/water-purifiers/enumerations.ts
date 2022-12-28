export enum Field {
    COLD_WATER_LOCK = "0002",
    HOT_WATER_LOCK = "0003",
    BUTTON_LOCK = "0005",
    FAUCET_STATE = "0014",
    FLOWING_MILLILITER = "000D"
}

export enum ColdWaterLock {
    LOCKED = "0",
    UNLOCKED = "1"
}

export enum HotWaterLock {
    LOCKED = "2",
    UNLOCKED = "1"
}

export enum ButtonLock {
    LOCKED = "1",
    UNLOCKED = "0"
}

export enum FaucetState {
    IDLE = "0",
    UNK0 = "1",
    UV_STERILIZATION = "2"
}