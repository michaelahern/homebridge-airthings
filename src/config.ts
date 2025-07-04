import { PlatformConfig } from 'homebridge';

export interface AirthingsDeviceConfig {
    name: string;
    serialNumber: string;
    batteryDisabled?: boolean;
    co2AirQualityDisabled?: boolean;
    humidityAirQualityDisabled?: boolean;
    pm25AirQualityDisabled?: boolean;
    radonAirQualityDisabled?: boolean;
    vocAirQualityDisabled?: boolean;
    co2DetectedThreshold?: number;
    radonLeakThreshold?: number;
    refreshInterval?: number;
}

export interface AirthingsPlatformConfig extends PlatformConfig {
    clientId: string;
    clientSecret: string;
    devices: AirthingsDeviceConfig[];
    debug?: boolean;
}
