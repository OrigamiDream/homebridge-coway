import CryptoJS from "crypto-js";

export default class Utils {

    static encryptPassword(password: string): string {
        const iv = CryptoJS.lib.WordArray.random(16);
        const key = CryptoJS.lib.WordArray.random(16);
        const intermediate = CryptoJS.AES.encrypt(password, key, {
            iv: iv
        });
        const prefix = iv.toString(CryptoJS.enc.Base64);
        const suffix = key.toString(CryptoJS.enc.Base64);
        const infix = intermediate.ciphertext.toString();
        return `${prefix}:${infix}:${suffix}`;
    }

    static parseSetCookies(cookies: string[]): string {
        let builder = '';
        for(let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].split(';')[0];
            const [ key, value ] = cookie.split('=');
            builder += `${key}=${value}; `;
        }
        return builder;
    }

}