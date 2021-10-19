import axios from "axios";
import { Logging } from "homebridge";
import { AccessToken, ClientCredentials } from "simple-oauth2";

export class AirthingsApi {
  private accessToken?: AccessToken;

  private readonly client: ClientCredentials;
  private readonly log: Logging;

  constructor(log: Logging, clientId: string, clientSecret: string) {
    const config = {
      client: {
        id: clientId,
        secret: clientSecret
      },
      auth: {
        tokenHost: "https://accounts.airthings.com",
        tokenPath: "https://accounts-api.airthings.com/v1/token"
      }
    };

    this.client = new ClientCredentials(config);
    this.log = log;
  }

  public async getLatestSamples(id: string) {
    if (this.accessToken == null || this.accessToken?.expired(300)) {
      const tokenParams = {
        scope: 'read:device:current_values',
      };
      this.accessToken = await this.client.getToken(tokenParams);
    }

    const requestConfig = {
      headers: { 'Authorization': this.accessToken.token.access_token }
    };

    const response = await axios.get<AirthingsApiDeviceSample>(`https://ext-api.airthings.com/v1/devices/${id}/latest-samples`, requestConfig);
    this.log.debug(JSON.stringify(response.data));
    return response.data;
  }
}

export interface AirthingsApiDeviceSample {
  data: {
    battery?: number;
    co2?: number;
    humidity?: number;
    pm1?: number;
    pm25?: number;
    pressure?: number;
    radonShortTermAvg?: number;
    temp?: number;
    time?: number;
    voc?: number;
  }
}
