import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alphaLabel, guideError, guideLabel, shiftPoints } from '../src/lib/zoneGuides.js';
import { sanitizeRegions, applyRegionCommand } from '../src/lib/regions';
import { rotateRegionForSheet } from '../src/lib/sheetPresentation.js';
const point=(sheet_id='a.pdf',at=[.3,.4])=>({sheet_id,at});
const guide=(kind='pair',points=[point(),point('b.pdf')])=>({id:'guide:a',kind,label:'Façade 1',actor:'human',reference_type:'view',target_role:'ground_floor',points});
const zone={id:'region:a',sheet_id:'a.pdf',name:'Façade',kind:'elevation',revision:1,purposes:['semantic'],geometry:{type:'polygon',verts_norm:[[0,0],[1,0],[0,1]]},review:{status:'confirmed'},preparation_ready:true};
test('guide sequence labels and rigid translation preserve dimensions and clamp to sheet',()=>{
 assert.equal(alphaLabel(27),'AA');assert.equal(alphaLabel(Infinity),'A');
 assert.equal(guideLabel('level_down',2),'SS2');assert.equal(guideLabel('datum',1),'RDC · réf. 100');
 assert.equal(guideLabel('axis_x',4,'E.1'),'E.1');
 const shifted=shiftPoints([[.1,.2],[.5,.2],[.5,.6]],.9,-.8);
 assert.deepEqual(shifted,[[.6,0],[1,0],[1,.39999999999999997]]);
 assert.deepEqual(shiftPoints([],1,1),[]);
});
test('pairs, partial guides and sectors round trip; invalid coordinates and cross-sheet measures refused',()=>{
 assert.equal(guideError([guide()]),null);
 assert.equal(guideError([guide('pair',[point()])]),null);
 assert.equal(guideError([guide('sector',[point(),point(),point('b.pdf'),point('b.pdf')])]),null);
 for(const g of [guide('measure'),guide('sector',[point(),point('b.pdf')]),guide('pair',[point('a.pdf',[NaN,0])]),{...guide(),actor:'model'}, {...guide(),id:''}]) assert.ok(guideError([g]));
 assert.ok(guideError([guide(),guide()]));
 const next={...zone,guides:[guide()],revision:2,preparation_ready:false};
 const loaded=sanitizeRegions(JSON.parse(JSON.stringify([next])));
 assert.deepEqual(loaded[0].guides,next.guides);
 const command=applyRegionCommand(sanitizeRegions([zone]),{type:'replace',region:loaded[0]});
 assert.deepEqual(applyRegionCommand(command.regions,command.inverse!).regions,sanitizeRegions([zone]));
 assert.equal(sanitizeRegions([{...zone,guides:[guide('measure')]}])[0].guides,undefined);
});
test('a POI is a two-corner crop on one linked-zone sheet',()=>{
 const poi={...guide('poi',[point('detail.pdf',[.1,.2]),point('detail.pdf',[.6,.8])]),id:'guide:poi',label:'POI 1',linked_region_id:'region:detail'};
 assert.equal(guideError([poi]),null);
 const loaded=sanitizeRegions([{...zone,guides:[poi]}]) as any[];
 assert.equal(loaded[0].guides?.[0].linked_region_id,'region:detail');
 assert.ok(guideError([{...poi,linked_region_id:undefined}]));
 assert.ok(guideError([{...poi,points:[point('detail.pdf'),point('other.pdf')]}]));
});
test('rotation transforms cross-sheet twin without moving owner boundary; reference remains human and not ready',()=>{
 const before={...zone,guides:[guide()]};
 const after=rotateRegionForSheet(before,'b.pdf',90);
 assert.deepEqual(after.geometry,before.geometry);
 assert.deepEqual(after.guides[0].points[0],before.guides[0].points[0]);
 assert.deepEqual(after.guides[0].points[1].at,[.6,.3]);
 assert.equal(after.preparation_ready,false);
 assert.equal(guideError(after.guides),null);
});
