# Homebridge Airthings

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/v/homebridge-airthings)](https://www.npmjs.com/package/homebridge-airthings)
[![npm](https://badgen.net/npm/dt/homebridge-airthings)](https://www.npmjs.com/package/homebridge-airthings)
[![License](https://badgen.net/github/license/michaelahern/homebridge-airthings)](LICENSE)
[![Build](https://github.com/michaelahern/homebridge-airthings/actions/workflows/build.yml/badge.svg)](https://github.com/michaelahern/homebridge-airthings/actions/workflows/build.yml)
[![Donate](https://badgen.net/badge/Donate/PayPal/green)](https://paypal.me/michaeljahern)

A [Homebridge](https://homebridge.io) plugin for
[Airthings](https://www.airthings.com) air quality monitors via the 
[Airthings Consumer API](https://developer.airthings.com/consumer-api-docs/).

## Requirements

 * [Homebridge](https://homebridge.io/)
 * One or more supported [Airthings](https://www.airthings.com/) air quality monitors
 * At least one Airthings SmartLink Hub ([Hub](https://www.airthings.com/hub), [View Plus](https://www.airthings.com/view-plus), [View Pollution](https://www.airthings.com/view-pollution), [View Radon](https://www.airthings.com/view-radon))

### Supported Devices

| Airthings Device                                                     | Serial Number |
| -------------------------------------------------------------------- | ------------- |
| [Airthings View Plus](https://www.airthings.com/view-plus)           | 2960xxxxxx    |
| [Airthings View Pollution](https://www.airthings.com/view-pollution) | 2980xxxxxx    |
| [Airthings View Radon](https://www.airthings.com/view-radon)         | 2989xxxxxx    |
| [Airthings Wave Plus](https://www.airthings.com/wave-plus)           | 2930xxxxxx    |
| [Airthings Wave Radon](https://www.airthings.com/wave-radon)         | 2950xxxxxx    |
| [Airthings Wave Mini](https://www.airthings.com/wave-mini)           | 2920xxxxxx    |

Note: Airthings Wave devices require an Airthings SmartLink Hub ([Hub](https://www.airthings.com/hub) or [View Series](https://www.airthings.com/for-home) device) to continuously push measurement data to the Airthings Cloud.

## Configuration

Example accessory config in the Homebridge config.json:

```json
"accessories": [
  {
    "accessory": "Airthings",
    "name": "Living Room Airthings View Plus",
    "clientId": "00000000-0000-0000-0000-000000000000",
    "clientSecret": "11111111-1111-1111-1111-111111111111",
    "serialNumber": "2960123456",
    "refreshInterval": 150,
    "radonLeakThreshold": 150
  }
]
```

### Configuration Details

Field           	     | Description
-----------------------|------------
**accessory**   	     | (required) Must be "Airthings"
**name**					     | (required) Name for the device in HomeKit
**clientId**			     | (required) API Client ID generated in the [Airthings Dashboard](https://dashboard.airthings.com)
**clientSecret**	     | (required) API Client Secret generated in the [Airthings Dashboard](https://dashboard.airthings.com)
**serialNumber**	     | (required) Serial number of the device
**refreshInterval**	   | (optional) Interval in seconds for refreshng sensor data, default is 150s<br/>Note: The Airthings Consumer API has a [rate limit of 120 requests per hour](https://developer.airthings.com/docs/api-rate-limit#airthings-consumer)
**radonLeakThreshold** | (optional) Enable a Radon Leak Sensor with a threshold in Bq/m³, disabled by default

### How to request an Airthings API Client ID & Secret

1. Login to the [Airthings Dashboard](https://dashboard.airthings.com)
2. Navigate to *Integrations*, then *Request API Client*
3. Create a new API Client with the following configuration:
    * Name: Homebridge
    * Resource Scope: read:device:current_values
    * Access Type: confidential
    * Flow Type: Client Credentials (machine-to-machine)
    * Enable: On

## Usage

### Air Quality

Air Quality is a composite of Radon, Particulate Matter (PM2.5), Volatile Organic Compound (VOC), Carbon Dioxide (CO2), and Humidity sensors, depending on the  sensors supported by your device. Air Quality values are based on [Airthings defined thresholds](https://help.airthings.com/en/articles/5367327-view-understanding-the-sensor-thresholds).

Apple HomeKit does not natively support Radon sensors. An optional Radon sensor implemented using a Leak Sensor.

Sensor | <svg height="10" width="10"><circle cx="5" cy="5" r="5" fill="#6dd559"></circle></svg> Excellent | <svg height="10" width="10"><circle cx="5" cy="5" r="5" fill="#f5b444"></circle></svg> Fair | <svg height="10" width="10"><circle cx="5" cy="5" r="5" fill="#ff5b32"></circle></svg> Poor |
----------------------------------|---------------|--------------------------------|----------------|
Radon                             | <100 Bq/m³    | ≥100 and <150 Bq/m³            | ≥150 Bq/m³     |
Particulate Matter (PM2.5)        | <10 μg/m³     | ≥10 and <25 μg/m³              | ≥25 μg/m³      |
Volatile Organic Compounds (VOCs) | <250 ppb      | ≥250 and <2000 ppb             | ≥2000 ppb      |
Carbon Dioxide (CO2)              | <800 ppm      | ≥800 and <1000 ppm             | ≥1000 ppm      |
Humidity                          | ≥30 and <60 % | ≥25 and <30 % or ≥60 and <70 % | <25 % or ≥70 % |

### Air Pressure

Air Pressure Sensors are implemented using a custom HomeKit service that is supported by some third-party HomeKit apps, including [Eve](https://www.evehome.com/en-us/eve-app) and [Home+](https://hochgatterer.me/home+/). Air Pressure Sensors are not natively supported by Apple HomeKit, and are thus not visible in the Apple Home app.

### Carbon Dioxide (CO2)

Carbon Dioxide Sensors are supported and implemented using standard Apple-defined services. The Carbon Dioxide Detected threshold is ≥1000 ppm.

### Temperature & Humidity

Temperature & Humidity Sensors are supported and implemented using standard Apple-defined services.
