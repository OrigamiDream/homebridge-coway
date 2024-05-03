export type IoCarePayloadRequest = AccessTokenRequest | DeviceListRequest | DeviceConnectionRequest |
    DeviceControlInfoRequest | DeviceHomeRequest | DeviceFilterInfoRequest | DeviceControlRequest |
    RefreshTokenRequest;

export interface AccessTokenRequest {
    authCode: string;
    redirectUrl: string;
}

export interface RefreshTokenRequest {
    refreshToken: string;
}

export interface DeviceListRequest {
    pageIndex: string;
    pageSize: string;
}

export interface DeviceConnectionRequest {
    devIds: string;
}

export interface DeviceHomeRequest {
    admdongCd: string;
    barcode: string;
    dvcBrandCd: string;
    prodName: string;
    stationCd: string;
    zipCode: string;
    resetDttm: string;
    deviceType: string;
    mqttDevice: string;
    orderNo: string;
    membershipYn: string;
    selfYn: string;
}

export interface DeviceControlInfoRequest {
    devId: string;
    mqttDevice: string;
    dvcBrandCd: string;
    dvcTypeCd: string;
    prodName: string;
}

export interface DeviceFilterInfoRequest {
    devId: string;
    orderNo: string;
    sellTypeCd: string;
    prodName: string;
    membershipYn: string;
    mqttDevice: string;
    selfYn: string;
}

export interface DeviceUpdateCommand {
    funcId: string;
    cmdVal: string;
}

export interface DeviceControlRequest {
    devId: string;
    funcList: DeviceUpdateCommand[];
    dvcTypeCd: string;
    isMultiControl: boolean;
}
