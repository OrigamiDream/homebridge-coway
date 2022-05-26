import {Logging} from "homebridge";
import {CowayConfig} from "./interfaces/config";
import axios, {AxiosRequestConfig, AxiosResponse} from "axios";
import {Constants, Endpoint, Field, URL} from "./enumerations";
import Utils from "./utils";
import {URLSearchParams} from "url";
import {AccessTokenRequest, DeviceUpdateCommand, PayloadRequest} from "./interfaces/requests";
import {Device} from "./interfaces/device";

export interface AccessToken {
    accessToken: string;
    refreshToken: string;
}

export interface PayloadCommand {
    key: Field;
    value: string;
}

export class CowayService {

    constructor(private readonly log: Logging) {
    }

    async signIn(config?: CowayConfig): Promise<AccessToken | undefined> {
        if(!config) {
            return undefined;
        }
        const stateId = await this.parseStateId();
        const cookies = await this.authenticate(config.username, config.password, stateId);
        const authenticationCode = await this.parseAuthenticationCode(cookies);
        return await this.getAccessTokens(authenticationCode);
    }

    private async parseStateId(): Promise<string> {
        const response = await this.wrapGet(URL.MEMBER_URL).catch(error => error.response);
        return response.request.path.match(/(?<=state=)(.*?)$/)[0];
    }

    private async authenticate(username: string, password: string, stateId: string): Promise<string> {
        const response = await this.wrapPost(URL.SIGN_IN_URL, {
            username: username,
            password: Utils.encryptPassword(password),
            state: stateId,
            auto_login: "Y"
        }).catch(error => error.response);
        return Utils.parseSetCookies(response.headers["set-cookie"]);
    }

    private async parseAuthenticationCode(cookies: string): Promise<string> {
        const response = await this.executeLoginPayload(URL.OAUTH_URL, cookies).catch(error => error.response);
        return response.request.path.match(/(?<=code=)(.*?)(?=&)/)[0];
    }

    private async getAccessTokens(authenticationCode: string): Promise<AccessToken> {
        const accessTokenRequest: AccessTokenRequest = {
            authCode: authenticationCode,
            isMobile: "M",
            langCd: "en",
            osType: "1",
            redirectUrl: URL.REDIRECT_URL,
            serviceCode: Constants.SERVICE_CODE
        }
        const response = await this.executePayload(Endpoint.GET_ACCESS_TOKEN, accessTokenRequest).catch(error => error.response);
        return {
            accessToken: response.data.header.accessToken,
            refreshToken: response.data.header.refreshToken
        };
    }

    private async executeLoginPayload(url: string, cookies?: string) {
        const headers: { [key: string]: string } = {
            "User-Agent": Constants.USER_AGENT
        }
        if(cookies) {
            headers["Cookie"] = cookies;
        }
        const params = {
            auth_type: "0",
            response_type: "code",
            client_id: Constants.CLIENT_ID,
            scope: "login",
            lang: "en_US",
            redirect_url: URL.REDIRECT_URL
        }
        url += url.indexOf("?") !== -1 ? "&" : "?";
        url += new URLSearchParams(params).toString();
        return await this.wrapGet(url, {
            headers: headers
        });
    }

    async executeSetPayloads(deviceInfo: Device, inputs: PayloadCommand[], accessToken?: AccessToken) {
        const functionList: DeviceUpdateCommand[] = inputs.map(({ key, value }) => {
            return {
                funcId: key,
                comdVal: value
            };
        });
        return await this.executePayload(Endpoint.SET_DEVICE_CONTROL, {
            barcode: deviceInfo.barcode,
            dvcBrandCd: deviceInfo.dvcBrandCd,
            dvcTypeCd: deviceInfo.dvcTypeCd,
            prodName: deviceInfo.prodName,
            funcList: functionList,
            refreshFlag: false,
            mqttDevice: true,
        }, accessToken);
    }

    async executePayload(urlKey: Endpoint, body: PayloadRequest, accessToken?: AccessToken, debug: boolean = true) {
        accessToken = accessToken || {
            accessToken: '',
            refreshToken: ''
        };
        const message = {
            header: {
                trcode: urlKey,
                accessToken: accessToken.accessToken,
                refreshToken: accessToken.refreshToken
            },
            body: body
        };
        const data = {
            message: JSON.stringify(message)
        };
        const requestUrl = `${URL.BASE_URL}/${urlKey}.json`;
        if(debug) {
            this.log.debug("[POST REQ] %s :: %s", requestUrl, JSON.stringify(body));
        }
        const url = `${requestUrl}?${new URLSearchParams(data).toString()}`;
        return this.wrapPost(url, data, {
            headers: {
                'User-Agent': Constants.USER_AGENT,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        }, false);
    }

    private async wrapGet(url: string, config?: AxiosRequestConfig, debug: boolean = true): Promise<AxiosResponse> {
        if(debug) {
            this.log.debug("[GET REQ]", url);
        }
        return await axios.get(url, config).then(response => {
            return response;
        });
    }

    private async wrapPost(url: string, data?: any, config?: AxiosRequestConfig, debug: boolean = true): Promise<AxiosResponse> {
        if(debug) {
            this.log.debug("[POST REQ]", url);
        }
        return await axios.post(url, data, config).then(response => {
            return response;
        });
    }

}