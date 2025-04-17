#!/bin/bash
mkdir -p ~/.homebridge
cp .devcontainer/config.json ~/.homebridge
sed -i "s|~/|$HOME/|g" ~/.homebridge/config.json
