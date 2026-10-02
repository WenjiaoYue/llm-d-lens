// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0

// Map a benchmark run's accelerator profile/runtime to a display label so chart
// titles describe the hardware that actually ran (XPU, GPU, or a neutral
// fallback) instead of a hardcoded "GPU / XPU".

export function acceleratorValue(record = {}) {
  return (
    record.metrics?.accelerator_profile ||
    record.accelerator_profile ||
    record.configuration?.accelerator ||
    record.spec?.accelerator ||
    record.deployment_configuration?.content?.accelerator ||
    record.resource_snapshot?.accelerator ||
    null
  );
}

export function acceleratorDisplayLabel(value) {
  const text = typeof value === 'string' ? value : value?.model || value?.name || '';
  const normalized = String(text).toLowerCase();
  if (normalized.includes('xpu') || normalized.includes('intel')) return 'XPU';
  if (normalized.includes('cuda') || normalized.includes('nvidia')) return 'GPU';
  return null;
}

export function utilizationLabel(value) {
  const label = acceleratorDisplayLabel(value);
  return label ? `${label} utilization` : 'GPU / XPU utilization';
}

// Per-vendor llm-d model-server images. The default must follow the selected
// cluster's hardware, never stay on the Intel XPU image for an NVIDIA cluster.
export const DEFAULT_RUNTIME_IMAGES = {
  gpu: 'ghcr.io/llm-d/llm-d-cuda:v0.9.0',
  xpu: 'ghcr.io/llm-d/llm-d-xpu:v0.9.0',
};

// The Guide's upstream variant id for a cluster's discovered hardware: `gpu`
// (NVIDIA) or `xpu` (Intel). Reads the cluster overview `hardware.accelerators`
// profile ids so the deploy configuration cannot stay on the wrong vendor.
export function acceleratorVariantForHardware(hardware) {
  const ids = (hardware?.accelerators || [])
    .map((entry) => String(entry?.id || entry || '').toLowerCase())
    .filter(Boolean);
  if (!ids.length) return null;
  const has = (needle) => ids.some((id) => id.includes(needle));
  if (has('nvidia') && !has('intel')) return 'gpu';
  if (has('intel') && !has('nvidia')) return 'xpu';
  return null;
}

// The default model-server image for a cluster's hardware, or null when the
// vendor is unknown (caller keeps its current image).
export function runtimeImageForHardware(hardware) {
  const variant = acceleratorVariantForHardware(hardware);
  return variant ? DEFAULT_RUNTIME_IMAGES[variant] : null;
}
