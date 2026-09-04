import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_WHEEL_ZOOM_PERCENT,
  sanitizeWheelZoomPercent,
  wheelIntent,
  wheelNotchDelta,
} from "../src/lib/wheelControls.js";

test("ordinary tabs keep the original wheel controls", () => {
  assert.equal(wheelIntent({ stacked: false, device: "mouse" }), "zoom-notch");
  assert.equal(wheelIntent({ stacked: false, device: "trackpad" }), "pan");
  assert.equal(wheelIntent({ stacked: false, modified: true, device: "trackpad" }), "zoom-continuous");
});

test("vertical stacks reserve the plain wheel for scrolling", () => {
  assert.equal(wheelIntent({ stacked: true, device: "mouse" }), "pan");
  assert.equal(wheelIntent({ stacked: true, device: "trackpad" }), "pan");
  assert.equal(wheelIntent({ stacked: true, modified: true, device: "mouse" }), "zoom-notch");
  assert.equal(wheelIntent({ stacked: true, modified: true, device: "trackpad" }), "zoom-continuous");
});

test("shift always pans and a normal view cannot inherit stack controls", () => {
  assert.equal(wheelIntent({ stacked: false, shiftKey: true, modified: true, device: "mouse" }), "pan");
  assert.equal(wheelIntent({ stacked: false, modified: false, device: "mouse" }), "zoom-notch");
});

test("the default wheel rate preserves the original 12 percent notch tuning", () => {
  assert.equal(DEFAULT_WHEEL_ZOOM_PERCENT, 12);
  assert.ok(Math.abs(wheelNotchDelta(-100) - 0.12) < 1e-12);
  assert.ok(Math.abs(wheelNotchDelta(100) + 0.12) < 1e-12);
  assert.ok(wheelNotchDelta(-100, 0, 24) > wheelNotchDelta(-100, 0, 12));
});

test("saved wheel rates are rounded and safely bounded", () => {
  assert.equal(sanitizeWheelZoomPercent("18.4"), 18);
  assert.equal(sanitizeWheelZoomPercent(1), 4);
  assert.equal(sanitizeWheelZoomPercent(99), 30);
  assert.equal(sanitizeWheelZoomPercent("broken"), 12);
});
