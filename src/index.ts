import { API } from 'homebridge';

import { AirthingsPlugin } from './plugin.js';

export default (api: API) => {
    api.registerAccessory('Airthings', AirthingsPlugin);
};
