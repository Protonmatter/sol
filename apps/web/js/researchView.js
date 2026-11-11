// Deferred Research presentation. Preparation precedes headers; canvas drawing follows.
import {store} from './store.js';
import {updateText} from './panels.js';
import {drawSolarDisk,drawButterfly} from './render.js';
import {currentBaseImage,baseImageState} from './data.js';
import {resolvePresentation} from './presentationState.js';
import {registerResearchRenderer} from './viewRegistry.js';

registerResearchRenderer({
  prepare(researching){
    if(researching)currentBaseImage();
    store.presentation=resolvePresentation({snapshot:store.state,wavelength:store.wavelength,
      imageState:baseImageState(store.wavelength),feedStatus:store.feedStatus,
      timeline:store.timelineIndex>=0?store.seriesRecords[store.timelineIndex]:null,
      liveEngineRun:store.liveEngineRun,dataError:store.dataError,nowMs:Date.now()});
    document.getElementById('solarExport')?.toggleAttribute('disabled',store.state.schema_version!=='solar-state-snapshot.v3');
    updateText();
  },
  draw(researching,resizeOnly=false){if(researching)drawSolarDisk({resizeOnly});drawButterfly();},
});
