// Atmosphere LUT manager (Hillaire 2020 style). Publishes its textures and parameters in
// the shared uniform map G so every lit material can use them.
//
// `world.atmosphere === null` is not a special case: it becomes an empty medium (all
// coefficients zero), the same passes run once, and the sky simply stays black.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { G } from '../render/globals.js';
import { makePassMaterial, renderPass } from '../render/fullscreen.js';
import { TRANSMITTANCE_FRAG, MULTISCAT_FRAG, SKYVIEW_FRAG, FROXEL_FRAG, IRRADIANCE_FRAG } from './atmosphereGlsl.js';

const KM = 0.001;
export const FROXEL_POW = 2.5;

function fl(n) { return Number.isInteger(n) ? n.toFixed(1) : String(n); }

export function atmosphereDefines() {
  const [sw, sh] = CONFIG.SKYVIEW, [mw, mh] = CONFIG.MULTISCATTER, [fw, fh, fd] = CONFIG.FROXEL, [ax, ay] = CONFIG.FROXEL_ATLAS;
  return {
    SKY_W: fl(sw), SKY_H: fl(sh), MS_W: fl(mw), MS_H: fl(mh), MS_SCALE: '10000.0',
    FROX_W: fl(fw), FROX_H: fl(fh), FROX_D: fd, ATLAS_X: ax, ATLAS_Y: ay, FROX_POW: fl(FROXEL_POW), IRR: CONFIG.IRRADIANCE,
  };
}

export class Atmosphere {
  constructor(renderer, world) {
    this.renderer = renderer;
    const a = world.atmosphere;
    this.empty = !a;
    const R = world.radius * KM;
    const v3 = (x) => new THREE.Vector3(...(x || [0, 0, 0]).map((c) => c / KM));   // per metre -> per km
    const dust = a?.dust, fog = dust?.fog, abs = a?.absorber;
    this.rPlanet = R;
    this.rBottom = R + (world.terrain.minAltitude - 300) * KM;
    this.rTop = R + (a?.topAltitude ?? 60000) * KM;
    this.rOcc = R + (a?.occluderAltitude ?? 0) * KM;
    const u = {
      uRPlanet: { value: R }, uRBottom: { value: this.rBottom }, uRTop: { value: this.rTop }, uROcc: { value: this.rOcc },
      uRayScat: { value: v3(a?.rayleigh?.scattering) }, uRayH: { value: (a?.rayleigh?.scaleHeight ?? 8000) * KM },
      uMieScat: { value: v3(dust?.scattering) }, uMieAbs: { value: v3(dust?.absorption) }, uMieH: { value: (dust?.scaleHeight ?? 8000) * KM },
      uMieG: { value: new THREE.Vector3(...(dust?.phaseG || [0, 0, 0])) },
      uFog: { value: new THREE.Vector4(fog?.density ?? 0, (fog?.baseAltitude ?? 0) * KM, (fog?.scaleHeight ?? 1000) * KM, fog?.maxDensity ?? 8) },
      uAbsCoef: { value: v3(abs?.absorption) }, uAbsLayer: { value: new THREE.Vector2((abs?.centerAltitude ?? 25000) * KM, (abs?.halfWidth ?? 15000) * KM) },
      uGroundAlbedo: { value: new THREE.Vector3(...(world.surface.meanAlbedo || world.surface.dust)) },
    };
    this.params = u;
    const defines = atmosphereDefines();
    const half = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };
    const [tw, th] = CONFIG.TRANSMITTANCE, [mw, mh] = CONFIG.MULTISCATTER, [sw, sh] = CONFIG.SKYVIEW, [fw, fh] = CONFIG.FROXEL, [ax, ay] = CONFIG.FROXEL_ATLAS;
    const I = CONFIG.IRRADIANCE;
    this.transmittance = new THREE.WebGLRenderTarget(tw, th, half);
    this.multiScat = new THREE.WebGLRenderTarget(mw, mh, half);
    this.skyView = new THREE.WebGLRenderTarget(sw, sh, { ...half, count: 2 });
    this.froxels = new THREE.WebGLRenderTarget(fw * ax, fh * ay, { ...half, count: 3 });
    this.irradiance = new THREE.WebGLRenderTarget(I, I + 1, half);
    this.gpuBytes = 8 * (tw * th + mw * mh + 2 * sw * sh + 3 * fw * ax * fh * ay + I * (I + 1));

    const lut = { tTransmittance: { value: this.transmittance.texture }, tMultiScat: { value: this.multiScat.texture } };
    const sky = { tSkySmooth: { value: this.skyView.textures[0] }, tSkyMie: { value: this.skyView.textures[1] }, uSkyParams: { value: new THREE.Vector4(Math.PI / 2, 0.01, 1, 0) } };
    this.cam = { uCamR: { value: R }, uSunMu: { value: 0 }, uLutScale: { value: 1 } };
    this.transMat = makePassMaterial(TRANSMITTANCE_FRAG, { ...u }, { defines });
    this.msMat = makePassMaterial(MULTISCAT_FRAG, { ...u, tTransmittance: lut.tTransmittance }, { defines });
    this.skyMat = makePassMaterial(SKYVIEW_FRAG, { ...u, ...lut, ...this.cam }, { defines });
    this.froxelU = { uCamPosKm: { value: new THREE.Vector3() }, uSunDirW: G.uSunDir, uCamRight: G.uCamRight, uCamUp: G.uCamUp, uCamFwd: G.uCamFwd, uTanHalfFov: G.uTanHalfFov, uFroxelMax: { value: 400 }, uLutScale: { value: 1 } };
    this.froxelMat = makePassMaterial(FROXEL_FRAG, { ...u, ...lut, ...this.froxelU }, { defines });
    this.irrMat = makePassMaterial(IRRADIANCE_FRAG, { ...u, tTransmittance: lut.tTransmittance, ...sky, ...this.cam }, { defines });

    // Publish for consumers (terrain, rocks, ship, sky dome, sun, bodies).
    Object.assign(G, u, {
      tTransmittance: lut.tTransmittance, ...sky,
      tIrradiance: { value: this.irradiance.texture },
      tFroxelA: { value: this.froxels.textures[0] }, tFroxelB: { value: this.froxels.textures[1] }, tFroxelC: { value: this.froxels.textures[2] },
      uFroxelMax: this.froxelU.uFroxelMax,
      uLutScaleInv: { value: new THREE.Vector2(1, 1) },
      uSkyFrame: { value: new THREE.Matrix3() },
      uSunLocal: { value: new THREE.Vector3(0, 0, 1) },
    });
    this.staticDone = false;
    this.lastMu = 99; this.lastR = -1;
    this._up = new THREE.Vector3(); this._sh = new THREE.Vector3(); this._third = new THREE.Vector3();
  }

  // camPos: planet-centred metres (doubles). sunDir: unit, planet-fixed. farDistance: metres.
  update(camPos, sunDir, farDistance, exposure) {
    const scale = Math.min(1e7, Math.max(1e-2, exposure));
    const r = this.renderer;
    if (!this.staticDone) {
      renderPass(r, this.transMat, this.transmittance);
      renderPass(r, this.msMat, this.multiScat);
      this.staticDone = true;
    }
    const up = this._up.copy(camPos).normalize();
    const camR = Math.min(this.rTop - 0.02, Math.max(this.rBottom + 0.02, camPos.length() * KM));
    const mu = up.dot(sunDir);

    // Local sky frame: x toward the Sun's azimuth, z up.
    const sh = this._sh.copy(sunDir).addScaledVector(up, -mu);
    if (sh.lengthSq() < 1e-10) sh.set(up.y, -up.x, 0).addScaledVector(up, -(up.y * up.x - up.x * up.y));
    sh.normalize();
    const third = this._third.crossVectors(up, sh);
    G.uSkyFrame.value.set(sh.x, sh.y, sh.z, third.x, third.y, third.z, up.x, up.y, up.z);
    G.uSunLocal.value.set(Math.sqrt(Math.max(0, 1 - mu * mu)), 0, mu);

    const drift = Math.abs(Math.log2(scale / (this.skyScale || 1e-9)));
    if (Math.abs(mu - this.lastMu) > 1.5e-4 || Math.abs(camR - this.lastR) > 0.004 || drift > 5) {
      this.lastMu = mu; this.lastR = camR; this.skyScale = scale;
      this.cam.uLutScale.value = scale; G.uLutScaleInv.value.x = 1 / scale;
      this.cam.uCamR.value = camR; this.cam.uSunMu.value = mu;
      const rG = this.rBottom;
      const beta = Math.acos(Math.min(1, Math.sqrt(Math.max(0, camR * camR - rG * rG)) / camR));
      G.uSkyParams.value.set(Math.PI - beta, Math.max(beta, 1e-4), 1 / scale, 0);
      renderPass(r, this.skyMat, this.skyView);
      renderPass(r, this.irrMat, this.irradiance);
    }

    // Aerial perspective froxels follow the camera every frame (one draw call).
    if (!this.empty || !this.froxelDone) {
      this.froxelU.uCamPosKm.value.copy(camPos).multiplyScalar(KM);
      this.froxelU.uFroxelMax.value = Math.min(1500, Math.max(20, farDistance * KM));
      this.froxelU.uLutScale.value = scale; G.uLutScaleInv.value.y = 1 / scale;
      renderPass(r, this.froxelMat, this.froxels);
      this.froxelDone = true;
    }
  }
}
