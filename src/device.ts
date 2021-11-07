export class AirthingsDevice {
  public static getDevice(serialNumber: string) {
    switch (serialNumber.substring(0, 3)) {
      case "290":
        return AirthingsDevice.WAVE;
      case "292":
        return AirthingsDevice.WAVE_MINI;
      case "293":
        return AirthingsDevice.WAVE_PLUS;
      case "295":
        return AirthingsDevice.WAVE_RADON;
      case "296":
        return AirthingsDevice.VIEW_PLUS;
      default:
        return AirthingsDevice.UNKNOWN;
    }
  }

  static readonly VIEW_PLUS: AirthingsDeviceInfo = {
    model: "View Plus",
    sensors: {
      co2: true,
      humidity: true,
      pm1: true,
      pm25: true,
      pressure: true,
      radonShortTermAvg: true,
      temp: true,
      voc: true
    }
  };

  static readonly WAVE: AirthingsDeviceInfo = {
    model: "Wave",
    sensors: {
      co2: false,
      humidity: true,
      pm1: false,
      pm25: false,
      pressure: false,
      radonShortTermAvg: true,
      temp: true,
      voc: false
    }
  };

  static readonly WAVE_MINI: AirthingsDeviceInfo = {
    model: "Wave Mini",
    sensors: {
      co2: false,
      humidity: true,
      pm1: false,
      pm25: false,
      pressure: false,
      radonShortTermAvg: false,
      temp: true,
      voc: true
    }
  };

  static readonly WAVE_PLUS: AirthingsDeviceInfo = {
    model: "Wave Plus",
    sensors: {
      co2: true,
      humidity: true,
      pm1: false,
      pm25: false,
      pressure: true,
      radonShortTermAvg: true,
      temp: true,
      voc: true
    }
  };

  static readonly WAVE_RADON: AirthingsDeviceInfo = {
    model: "Wave Radon",
    sensors: {
      co2: false,
      humidity: true,
      pm1: false,
      pm25: false,
      pressure: false,
      radonShortTermAvg: true,
      temp: true,
      voc: false
    }
  };

  static readonly UNKNOWN: AirthingsDeviceInfo = {
    model: "Unknown",
    sensors: {
      co2: false,
      humidity: false,
      pm1: false,
      pm25: false,
      pressure: false,
      radonShortTermAvg: false,
      temp: false,
      voc: false
    }
  };
}

export interface AirthingsDeviceInfo {
  model: string;
  sensors: {
    co2: boolean;
    humidity: boolean;
    pm1: boolean;
    pm25: boolean;
    pressure: boolean;
    radonShortTermAvg: boolean;
    temp: boolean;
    voc: boolean;
  }
}
