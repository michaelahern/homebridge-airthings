export interface AirthingsConfig {
    devices: AirthingsDeviceConfig[];
    debug?: boolean;
    refreshInterval?: number;
}

export interface AirthingsDeviceConfig {
    name: string;
    clientId: string;
    clientSecret: string;
    serialNumber: string;
    batteryDisabled?: boolean;
    co2AirQualityDisabled?: boolean;
    humidityAirQualityDisabled?: boolean;
    pm25AirQualityDisabled?: boolean;
    radonAirQualityDisabled?: boolean;
    vocAirQualityDisabled?: boolean;
    co2DetectedThreshold?: number;
    radonLeakThreshold?: number;
}
