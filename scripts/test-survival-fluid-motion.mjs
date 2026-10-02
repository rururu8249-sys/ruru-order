import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const api=createUiLoader()('components/event-shared/SurvivalDisasterSprite.tsx');
assert.equal(typeof api.sampleWaveFrames,'function','water atlas must interpolate instead of freezing on its final photograph');
for(const age of [0,200,850,1200,2400,NaN,Infinity,-1]){
 const f=api.sampleWaveFrames(age);
 assert(Number.isInteger(f.from)&&f.from>=0&&f.from<8);
 assert(Number.isInteger(f.to)&&f.to>=0&&f.to<8);
 assert(f.mix>=0&&f.mix<=1);
}
assert.notDeepEqual(api.sampleWaveFrames(850),api.sampleWaveFrames(1050),'water must keep changing after the first 700ms');
assert.deepEqual(api.sampleWaveFrames(2400),api.sampleWaveFrames(2400),'reconnects share identical water phase');
assert.equal(typeof api.sampleWaveEdge,'function','the square atlas front must have a deforming feathered contour');
const edgeA=api.sampleWaveEdge(200),edgeB=api.sampleWaveEdge(400);
assert(edgeA.length>=32);
assert(new Set(edgeA.map(e=>e.end)).size>16,'front cannot remain a vertical cut');
assert.notDeepEqual(edgeA,edgeB,'front and foam follow the moving water');
for(const e of edgeA){assert(e.start<e.end&&e.start>=0&&e.end<=100);}
// A static billboard, rotation of the whole bitmap, or local wall-clock phase
// must fail: distinct pieces of the fluid must move relative to one another.
assert.equal(typeof api.sampleDisasterFluid,'function','fluid needs independently sampled particles');
for(const kind of ['tornado','tsunami']){
 const a=api.sampleDisasterFluid(kind,200,0),b=api.sampleDisasterFluid(kind,400,0);
 assert.deepEqual(a,api.sampleDisasterFluid(kind,200,0),'same event age must reproduce on another screen');
 assert(a.particles.length>30&&a.particles.length<=160,'bounded detailed particle budget');
 assert.notEqual(a.particles[0].x,b.particles[0].x,'fluid material must circulate');
 assert.notEqual(a.particles[1].x-a.particles[0].x,b.particles[1].x-b.particles[0].x,'not a rigid still image translation');
 for(const age of [-10,0,400,850,NaN,Infinity]){
  const sample=api.sampleDisasterFluid(kind,age,2);
  for(const p of sample.particles)for(const key of ['x','y','width','height','opacity','angle'])assert(Number.isFinite(p[key]),kind+' finite '+key);
 }
}
assert.notDeepEqual(api.sampleDisasterFluid('tornado',400,0),api.sampleDisasterFluid('tornado',400,1),'different tornado passes need different bending and flow');
const wave=api.sampleDisasterFluid('tsunami',400,0);
const funnel=api.sampleDisasterFluid('tornado',200,0),later=api.sampleDisasterFluid('tornado',400,0);
assert(funnel.vortices?.length>=12,'funnel needs rotating textured cross-sections rather than a filled cone');
assert.notEqual(funnel.vortices[0].angle,later.vortices[0].angle,'cross-section material must rotate with event age');
assert.notEqual(funnel.vortices[0].angle-funnel.vortices[1].angle,later.vortices[0].angle-later.vortices[1].angle,'different heights must not rotate as one flat bitmap');
assert(wave.bands.length>=12,'water must deform in several bands, not one rigid swipe');
assert(new Set(wave.bands.map(b=>b.offset)).size>8,'different depths must shear differently');
assert.equal(wave.bands.reduce((sum,b)=>sum+b.height,0),1,'additive water strips must cover exactly one image, not overlap into bright horizontal seams');
wave.bands.forEach((b,i)=>{assert.equal(b.y,i/32);assert.equal(b.height,1/32);});
console.log('PASS deterministic circulating fluids, deforming wave, varied funnels, finite inputs, bounded particle budget');
