#!/usr/bin/env node
import { onCreated } from "./events";
setInterval(onCreated, 1000);
