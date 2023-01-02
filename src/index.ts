import { API } from "homebridge";

import { AirthingsPlugin } from "./plugin";

export = (api: API) => {
  api.registerAccessory("Airthings", AirthingsPlugin);
};
