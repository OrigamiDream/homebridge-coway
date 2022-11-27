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

export interface Session {
    session: string;
    cookies: string;
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
        const session = await this.parseSession();
        const authenticationCode = await this.authenticate(config.username, config.password, session);
        return await this.getAccessTokens(authenticationCode);
    }

    private async parseSession(): Promise<Session> {
        const params = {
            auth_type: "0",
            response_type: "code",
            client_id: Constants.CLIENT_ID,
            ui_locales: "en-US",
            dvc_cntry_id: "US",
            redirect_uri: URL.NEW_REDIRECT_URL,
        };
        const queryString = new URLSearchParams(params).toString();
        const response = await this.wrapGet(`${URL.NEW_SIGN_IN_URL}?${queryString}`).catch(error => error.response);
        const matches = response.data.match(/(action=")(https:\/\/.*)(\?session_code=)(.*)(" )/);
        return {
            session: matches[matches.length - 2].replaceAll("&amp;", "&"),
            cookies: Utils.parseSetCookies(response.headers["set-cookie"])
        };
    }

    private async authenticate(username: string, password: string, session: Session): Promise<string> {
        const data = {
            termAgreementStatus: "",
            idp: "",
            username: username,
            password: password,
            rememberMe: "on"
        };
        const encoded = new URLSearchParams(data).toString();
        const response = await this.wrapPost(`${URL.NEW_AUTHENTICATE_URL}?session_code=${session.session}`, encoded, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": session.cookies,
            }
        }).catch(error => error.response);
        const path = response.request.path.split('?')[1];
        const splits = path.split('&');
        const dicts: { [key: string]: string } = {};
        for(let i = 0; i < splits.length; i++) {
            const kv = splits[i].split('=');
            dicts[kv[0]] = kv[1];
        }
        return dicts["code"];
    }

    private async getAccessTokens(authenticationCode: string): Promise<AccessToken> {
        const accessTokenRequest: AccessTokenRequest = {
            authCode: authenticationCode,
            isMobile: "M",
            langCd: "en",
            osType: "2",
            redirectUrl: URL.NEW_REDIRECT_URL,
            serviceCode: Constants.SERVICE_CODE
        }
        const response = await this.executePayload(Endpoint.GET_ACCESS_TOKEN, accessTokenRequest).catch(error => error.response);
        return {
            accessToken: response.data.header.accessToken,
            refreshToken: response.data.header.refreshToken
        };
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