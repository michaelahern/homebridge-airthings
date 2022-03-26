import axios from "axios";
import { AccessToken, ClientCredentials } from "simple-oauth2";

export class AirthingsApi {
  private accessToken?: AccessToken;

  private readonly client?: ClientCredentials;

  constructor(clientId?: string, clientSecret?: string) {
    if (clientId == null || clientSecret == null) {
      return;
    }

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
  }

  public async getLatestSamples(id: string) {
    if (this.client == null) {
      throw new Error("Airthings API Client not initialized due to invalid configuration...");
    }

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
    return response.data;
  }
}

export interface AirthingsApiDeviceSample {
  data: {
    battery?: number;
    co2?: number;
    humidity?: number;
    mold?: number;
    pm1?: number;
    pm25?: number;
    pressure?: number;
    radonShortTermAvg?: number;
    temp?: number;
    time?: number;
    voc?: number;
  }
}
