import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createUiLoader} from './admin-ui-test-loader.mjs';

// Catch locally present but uncommitted art that Git deployments cannot serve.
const {default:Character,SURVIVAL_CHARACTER_COUNT}=createUiLoader()('components/event-shared/SurvivalCharacter.tsx');
const tracked=new Set(execFileSync('git',['ls-files','-z','public/event-art'],{encoding:'utf8'}).split('\0'));
const assets=new Set();
for(let index=0;index<SURVIVAL_CHARACTER_COUNT;index++){
  for(const pose of ['rest','look','duck','run'])for(const elapsedMs of [0,80,160,240,320,400,480,560]){
    const art=Character({index,total:100,pose,moving:true,elapsedMs}).props.children.props;
    const asset=art.style.backgroundImage.match(/^url\("([^\"]+)"\)$/)?.[1];
    assert(asset,`${art['aria-label']}: image URL required`);
    assert(tracked.has('public'+asset),`${art['aria-label']}: missing from Git deployment: ${asset}`);
    assets.add(asset);
  }
}
for(const asset of assets){
  const local=await fs.readFile('public'+asset);
  const metadata=await sharp(local).metadata();
  assert(metadata.width>0&&metadata.height>0&&metadata.hasAlpha,`${asset}: valid transparent image required`);
  await sharp(local).raw().toBuffer();
  if(process.env.SURVIVAL_ASSET_BASE_URL){
    const response=await fetch(new URL(asset,process.env.SURVIVAL_ASSET_BASE_URL));
    assert.equal(response.status,200,`${asset}: deployed HTTP status`);
    const deployed=Buffer.from(await response.arrayBuffer());
    assert.deepEqual(deployed,local,`${asset}: deployment must serve the checked image bytes`);
  }
}
console.log(`PASS ${SURVIVAL_CHARACTER_COUNT} characters, all poses, ${assets.size} tracked/decoded assets${process.env.SURVIVAL_ASSET_BASE_URL?' and deployed bytes':''}`);
