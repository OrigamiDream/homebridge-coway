export type PayloadRequest =
    AccessTokenRequest |
    DeviceListRequest |
    DeviceStatusRequest |
    DeviceUpdateRequest |
    DeviceRefreshRequest;

export interface AccessTokenRequest {
    authCode: string;
    isMobile: string;
    langCd: string;
    osType: string;
    redirectUrl: string;
    serviceCode: string;
}

export interface DeviceListRequest {
    pageIndex: string;
    pageSize: string;
}

export interface DeviceStatusRequest {
    barcode: string;
    dvcBrandCd: string;
    prodName: string;
    stationCd: string;
    resetDttm: string;
    dvcTypeCd: string;
    refreshFlag: string;
}

export interface DeviceUpdateCommand {
    comdVal: string;
    funcId: string;
}

export interface DeviceUpdateRequest {
    barcode: string;
    dvcBrandCd: string;
    dvcTypeCd: string;
    prodName: string;
    funcList: DeviceUpdateCommand[];
    refreshFlag: boolean;
    mqttDevice: boolean;
}

export interface DeviceRefreshRequest {
    barcode: string;
    dvcBrandCd: string;
    prodName: string;
    dvcTypeCd: string;
}