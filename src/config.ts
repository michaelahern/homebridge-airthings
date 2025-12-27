import { PlatformConfig } from 'homebridge';

export interface AirthingsConfig extends PlatformConfig {
    clientId: string;
    clientSecret: string;
    devices: AirthingsDeviceConfig[];
    debug?: boolean;
    pollInterval?: number;
}

export interface AirthingsDeviceConfig {
    name: string;
    serialNumber: string;
    airQualitySensor?: {
        co2Disabled?: boolean;
        humidityDisabled?: boolean;
        pm25Disabled?: boolean;
        radonDisabled?: boolean;
        vocDisabled?: boolean;
    };
    battery?: {
        disabled?: boolean;
    };
    detectionThresholds?: {
        co2?: number;
        radon?: number | undefined;
    };
}
