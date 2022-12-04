import { AirthingsApi, AirthingsApiDeviceSample } from "./api";
import { AirthingsDevice, AirthingsDeviceInfo } from "./device";
import { AccessoryConfig, AccessoryPlugin, API, Formats, Logging, Perms, Service } from "homebridge";

export = (api: API) => {
  api.registerAccessory("Airthings", AirthingsPlugin);
};

class AirthingsPlugin implements AccessoryPlugin {
  private readonly log: Logging;
  private readonly timer: NodeJS.Timer;

  private readonly airthingsApi: AirthingsApi;
  private readonly airthingsConfig: AirthingsPluginConfig;
  private readonly airthingsDevice: AirthingsDeviceInfo;

  private readonly informationService: Service;
  private readonly batteryService: Service;
  private readonly airQualityService: Service;
  private readonly temperatureService: Service;
  private readonly humidityService: Service;
  private readonly carbonDioxideService: Service;
  private readonly airPressureService: Service;
  private readonly radonService: Service;

  private latestSamples: AirthingsApiDeviceSample = {
    data: {}
  };

  constructor(log: Logging, config: AirthingsPluginConfig, api: API) {
    this.log = log;

    if (config.clientId == undefined) {
      this.log.error("Missing required config value: clientId");
    }

    if (config.clientSecret == undefined) {
      this.log.error("Missing required config value: clientSecret");
    }

    if (config.serialNumber == undefined) {
      this.log.error("Missing required config value: serialNumber");
      config.serialNumber = "0000000000";
    }

    if (config.refreshInterval == undefined || !Number.isSafeInteger(config.refreshInterval)) {
      this.log.warn("Invalid config value: refreshInterval (not a valid integer)")
      config.refreshInterval = 150;
    }

    if (config.refreshInterval < 60) {
      this.log.warn("Invalid config value: refreshInterval (<60s may cause rate limiting)");
      config.refreshInterval = 60;
    }

    if (config.radonLeakThreshold != undefined && !Number.isSafeInteger(config.radonLeakThreshold)) {
      this.log.warn("Invalid config value: radonLeakThreshold (not a valid integer)")
      config.radonLeakThreshold = undefined;
    }

    this.airthingsApi = new AirthingsApi(config.clientId, config.clientSecret);
    this.airthingsConfig = config;
    this.airthingsDevice = AirthingsDevice.getDevice(config.serialNumber);

    this.log.info(`Device Model: ${this.airthingsDevice.model}`);
    this.log.info(`Serial Number: ${this.airthingsConfig.serialNumber}`);
    this.log.info(`Refresh Interval: ${this.airthingsConfig.refreshInterval}s`);
    this.log.info(`Radon Leak Sensor: ${this.airthingsDevice.sensors.radonShortTermAvg ? (this.airthingsConfig.radonLeakThreshold != undefined ? "Enabled" : "Disabled") : "Not Supported"}`);
    if (this.airthingsDevice.sensors.radonShortTermAvg && this.airthingsConfig.radonLeakThreshold != undefined) {
      this.log.info(`Radon Leak Threshold: ${this.airthingsConfig.radonLeakThreshold} Bq/m³`);
    }

    // HomeKit Accessory Information Service
    this.informationService = new api.hap.Service.AccessoryInformation()
      .setCharacteristic(api.hap.Characteristic.Manufacturer, "Airthings")
      .setCharacteristic(api.hap.Characteristic.Model, this.airthingsDevice.model)
      .setCharacteristic(api.hap.Characteristic.Name, config.name)
      .setCharacteristic(api.hap.Characteristic.SerialNumber, config.serialNumber)
      .setCharacteristic(api.hap.Characteristic.FirmwareRevision, "Unknown");

    // HomeKit Battery Service
    this.batteryService = new api.hap.Service.Battery("Battery");

    // HomeKit Air Quality Service
    this.airQualityService = new api.hap.Service.AirQualitySensor("Air Quality");

    if (this.airthingsDevice.sensors.mold) {
      this.airQualityService.addCharacteristic(new api.hap.Characteristic("Mold", "68F9B9E6-88C7-4FB3-B8CE-60205F9F280E", {
        format: Formats.UINT16,
        perms: [Perms.NOTIFY, Perms.PAIRED_READ],
        unit: "Risk",
        minValue: 0,
        maxValue: 10,
        minStep: 1
      }));
    }

    if (this.airthingsDevice.sensors.radonShortTermAvg) {
      this.airQualityService.addCharacteristic(new api.hap.Characteristic("Radon", "B42E01AA-ADE7-11E4-89D3-123B93F75CBA", {
        format: Formats.UINT16,
        perms: [Perms.NOTIFY, Perms.PAIRED_READ],
        unit: "Bq/m³",
        minValue: 0,
        maxValue: 20000,
        minStep: 1
      }));
    }

    this.airQualityService.getCharacteristic(api.hap.Characteristic.VOCDensity).setProps({
      unit: "µg/m³",
      maxValue: 65535
    });

    if (this.airthingsDevice.sensors.voc) {
      this.airQualityService.addCharacteristic(new api.hap.Characteristic("VOC Density (ppb)", "E5B6DA60-E041-472A-BE2B-8318B8A724C5", {
        format: Formats.UINT16,
        perms: [Perms.NOTIFY, Perms.PAIRED_READ],
        unit: "ppb",
        minValue: 0,
        maxValue: 10000,
        minStep: 1
      }));
    }

    // HomeKit Temperature Service
    this.temperatureService = new api.hap.Service.TemperatureSensor("Temp");

    // HomeKit Humidity Service
    this.humidityService = new api.hap.Service.HumiditySensor("Humidity");

    // HomeKit CO2 Service
    this.carbonDioxideService = new api.hap.Service.CarbonDioxideSensor("CO2");

    // Eve Air Pressure Service
    this.airPressureService = new api.hap.Service("Air Pressure", "e863f00a-079e-48ff-8f27-9c2605a29f52");

    this.airPressureService.addCharacteristic(new api.hap.Characteristic("Air Pressure", "e863f10f-079e-48ff-8f27-9c2605a29f52", {
      format: Formats.UINT16,
      perms: [Perms.NOTIFY, Perms.PAIRED_READ],
      unit: "mBar",
      minValue: 0,
      maxValue: 1200,
      minStep: 1,
    }));

    this.airPressureService.addCharacteristic(api.hap.Characteristic.StatusActive);

    // HomeKit Radon (Leak) Service
    this.radonService = new api.hap.Service.LeakSensor("Radon");

    this.refreshCharacteristics(api);
    this.timer = setInterval(async () => { await this.refreshCharacteristics(api) }, config.refreshInterval * 1000);
  }

  getServices(): Service[] {
    const services = [this.informationService, this.batteryService, this.airQualityService];

    if (this.airthingsDevice.sensors.temp) {
      services.push(this.temperatureService);
    }

    if (this.airthingsDevice.sensors.humidity) {
      services.push(this.humidityService);
    }

    if (this.airthingsDevice.sensors.co2) {
      services.push(this.carbonDioxideService);
    }

    if (this.airthingsDevice.sensors.pressure) {
      services.push(this.airPressureService);
    }

    if (this.airthingsDevice.sensors.radonShortTermAvg && this.airthingsConfig.radonLeakThreshold != undefined) {
      services.push(this.radonService);
    }

    return services;
  }

  async getLatestSamples() {
    if (this.airthingsConfig.serialNumber == undefined) {
      return;
    }

    try {
      this.latestSamples = await this.airthingsApi.getLatestSamples(this.airthingsConfig.serialNumber);
      this.log.info(JSON.stringify(this.latestSamples.data));
    }
    catch (err) {
      if (err instanceof Error) {
        this.log.error(err.message);
      }
    }
  }

  async refreshCharacteristics(api: API) {
    await this.getLatestSamples();

    // HomeKit Battery Service
    this.batteryService.getCharacteristic(api.hap.Characteristic.BatteryLevel).updateValue(
      this.latestSamples.data.battery ?? 100
    );

    this.batteryService.getCharacteristic(api.hap.Characteristic.StatusLowBattery).updateValue(
      this.latestSamples.data.battery == undefined || this.latestSamples.data.battery > 10
        ? api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
        : api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
    );

    // HomeKit Air Quality Service
    this.airQualityService.getCharacteristic(api.hap.Characteristic.AirQuality).updateValue(
      this.getAirQuality(api, this.latestSamples)
    );

    if (this.airthingsDevice.sensors.mold) {
      this.airQualityService.getCharacteristic("Mold")!.updateValue(
        this.latestSamples.data.mold ?? 0
      );
    }

    if (this.airthingsDevice.sensors.pm25) {
      this.airQualityService.getCharacteristic(api.hap.Characteristic.PM2_5Density).updateValue(
        this.latestSamples.data.pm25 ?? 0
      );
    }

    if (this.airthingsDevice.sensors.radonShortTermAvg) {
      this.airQualityService.getCharacteristic("Radon")!.updateValue(
        this.latestSamples.data.radonShortTermAvg ?? 0
      );
    }

    if (this.airthingsDevice.sensors.voc) {
      const temp = this.latestSamples.data.temp ?? 25;
      const pressure = this.latestSamples.data.pressure ?? 1013;
      this.airQualityService.getCharacteristic(api.hap.Characteristic.VOCDensity)!.updateValue(
        this.latestSamples.data.voc != undefined ? this.latestSamples.data.voc * (78 / (22.41 * ((temp + 273) / 273) * (1013 / pressure))) : 0
      );

      this.airQualityService.getCharacteristic("VOC Density (ppb)")!.updateValue(
        this.latestSamples.data.voc ?? 0
      );
    }

    this.airQualityService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
      this.latestSamples.data.time != undefined && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60
    );

    // HomeKit Temperature Service
    this.temperatureService.getCharacteristic(api.hap.Characteristic.CurrentTemperature).updateValue(
      this.latestSamples.data.temp ?? null
    );

    this.temperatureService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
      this.latestSamples.data.temp != undefined && this.latestSamples.data.time != undefined && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60
    );

    // HomeKit Humidity Service
    this.humidityService.getCharacteristic(api.hap.Characteristic.CurrentRelativeHumidity).updateValue(
      this.latestSamples.data.humidity ?? 0
    );

    this.humidityService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
      this.latestSamples.data.humidity != undefined && this.latestSamples.data.time != undefined && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60
    );

    // HomeKit CO2 Service
    this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.CarbonDioxideDetected).updateValue(
      this.latestSamples.data.co2 == undefined || this.latestSamples.data.co2 < 1000
        ? api.hap.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL
        : api.hap.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL
    );

    this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.CarbonDioxideLevel).updateValue(
      this.latestSamples.data.co2 ?? 0
    );

    this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
      this.latestSamples.data.co2 != undefined && this.latestSamples.data.time != undefined && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60
    );

    // Eve Air Pressure Service
    this.airPressureService.getCharacteristic("Air Pressure")!.updateValue(
      this.latestSamples.data.pressure ?? 1012
    );

    this.airPressureService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
      this.latestSamples.data.pressure != undefined && this.latestSamples.data.time != undefined && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60
    );

    // HomeKit Radon (Leak) Service
    this.radonService.getCharacteristic(api.hap.Characteristic.LeakDetected).updateValue(
      this.latestSamples.data.radonShortTermAvg == undefined || this.latestSamples.data.radonShortTermAvg < (this.airthingsConfig.radonLeakThreshold ?? 0)
        ? api.hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED
        : api.hap.Characteristic.LeakDetected.LEAK_DETECTED
    );

    this.radonService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
      this.latestSamples.data.radonShortTermAvg != undefined && this.latestSamples.data.time != undefined && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60
    );
  }

  getAirQuality(api: API, latestSamples: AirthingsApiDeviceSample) {
    let aq = api.hap.Characteristic.AirQuality.UNKNOWN;

    const humidity = latestSamples.data.humidity;
    if (humidity != undefined) {
      if (humidity < 25 || humidity >= 70) {
        aq = api.hap.Characteristic.AirQuality.POOR;
      }
      else if (humidity < 30 || humidity >= 60) {
        aq = api.hap.Characteristic.AirQuality.FAIR;
      }
      else {
        aq = api.hap.Characteristic.AirQuality.EXCELLENT;
      }
    }

    const co2 = latestSamples.data.co2;
    if (co2 != undefined) {
      if (co2 >= 1000) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
      }
      else if (co2 >= 800) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
      }
      else {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.EXCELLENT);
      }
    }

    const mold = latestSamples.data.mold;
    if (mold != undefined) {
      if (mold >= 5) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
      }
      else if (mold >= 3) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
      }
      else {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.EXCELLENT);
      }
    }

    const pm25 = latestSamples.data.pm25;
    if (pm25 != undefined) {
      if (pm25 >= 25) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
      }
      else if (pm25 >= 10) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
      }
      else {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.EXCELLENT);
      }
    }

    const radonShortTermAvg = latestSamples.data.radonShortTermAvg;
    if (radonShortTermAvg != undefined) {
      if (radonShortTermAvg >= 150) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
      }
      else if (radonShortTermAvg >= 100) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
      }
      else {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.EXCELLENT);
      }
    }

    const voc = latestSamples.data.voc;
    if (voc != undefined) {
      if (voc >= 2000) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
      }
      else if (voc >= 250) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
      }
      else {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.EXCELLENT);
      }
    }

    return aq;
  }
}

interface AirthingsPluginConfig extends AccessoryConfig {
  clientId?: string;
  clientSecret?: string;
  serialNumber?: string;
  refreshInterval?: number;
  radonLeakThreshold?: number;
}
