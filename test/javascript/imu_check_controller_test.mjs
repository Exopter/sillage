import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const source = (await readFile(new URL('../../app/javascript/controllers/imu_check_controller.js', import.meta.url),'utf8'))
  .replace(/^import .*$/gm,'')
  .replace(/^const Base = .*$/m,'const Base = class {}')
const healthURL = new URL('../../app/javascript/lib/imu_health.js',import.meta.url).href
const {default: Guide} = await import(`data:text/javascript;base64,${Buffer.from(`import {ImuHealth, SixFaceCapture, ReferenceCapture, imuQualityLabel, FACE_NAMES, FACE_HOLD_RULES, referenceIssue} from '${healthURL}';\n${source}`).toString('base64')}`)
function makeGuide() {
 const guide = new Guide()
 for(const name of ['attitude','heading','qualityReason','actionButton','title','instruction','progress','result','connectButton']) guide[`${name}Target`]={textContent:'',dataset:{},value:0}
 guide.confirmedTarget={checked:true}
 guide.kindValue='calibration'; guide.deviceValue='ECU-ABC123'; guide.flightValue=''
 guide.renderGuidance=()=>{}
 guide.active=true
 return guide
}
const guide = makeGuide()
guide.port={}; guide.source='1/191'; guide.connectedDeviceId=guide.deviceValue
guide.health.quality={deviceId:guide.deviceValue,accuracy:[2,0,3,3]}
guide.phase='level'
guide.faces.completed=Object.fromEntries(['x+','x-','y+','y-','z+','z-'].map(face=>[face,3100]))
guide.rotation=[1,1,1]
const completed=structuredClone(guide.faces.completed)
let now=1000, sample={t:0,roll:0,pitch:0,accel:[0,0,9.80665],gyro:[0,0,0],mag:[20,0,25],accuracy:[2,0,3,3],heading_accuracy:4.1,quality_age:10}
const originalNow=Date.now
Date.now=()=>now
let saveCalls=0
guide.save=()=>{saveCalls++;guide.phase='saving'}
guide.health.sample=()=>sample
guide.health.status=()=>({attitude:'degraded',heading:'consistent',reason:'imu quality low',issues:['imu_quality_low']})
guide.advance()
const firstUuid=guide.uuid
for(let time=0;time<=15000;time+=100) {
 now=1000+time
 sample={t:time,roll:0,pitch:0,accel:[0,0,9.80665],gyro:[0,0,0],mag:[20,0,25],accuracy:[2,0,3,3],heading_accuracy:4.1,quality_age:10}
 guide.tick()
}
assert.equal(saveCalls,1,'the actual controller submits a persistent low-quality diagnostic after 15 seconds')
assert.equal(guide.samples.length,151)
assert.match(guide.instructionTarget.textContent,/Gyroscope 0\/3/)
guide.phase='result';guide.checkPassed=false
guide.advance()
assert.equal(guide.phase,'measuring')
assert.notEqual(guide.uuid,firstUuid,'retry is a distinct assessment, not an idempotent repeat of the failed save')
assert.deepEqual(guide.faces.completed,completed,'retry preserves actual measured face evidence')
assert.deepEqual(guide.rotation,[1,1,1])
assert.equal(guide.samples.length,0,'failed samples must not contaminate the retry')
sample=null;now+=45000;guide.tick()
assert.equal(guide.phase,'reference_blocked','radio loss cannot leave the controller measuring forever')
assert.equal(guide.actionButtonTarget.textContent,'Retry reference')
assert.deepEqual(guide.faces.completed,completed)
now+=100;guide.advance()
assert.equal(guide.phase,'reference_blocked','retry also requires a live matching recorder')
sample={t:now,roll:0,pitch:0,accel:[0,0,9.80665],gyro:[0,0,0],mag:[20,0,25],accuracy:[2,0,3,3],heading_accuracy:4.1,quality_age:10}
guide.advance()
assert.equal(guide.phase,'measuring')
assert.equal(guide.capture.expired(now),false)
guide.health.generation++;guide.tick()
assert.equal(guide.phase,'ready','a hardware restart invalidates previous physical evidence')
assert.deepEqual(guide.faces.completed,{})

const quality={name:'imu_quality',deviceId:'ECU-ABC123',bootId:42,imuEpoch:1,firmware:'fdr_integrated/56',headingAccuracyDeg:3,accuracy:[3,3,3,3],agesMs:[1,1,1,1],validity:120}
const imu={name:'highres_imu',coordinateFrame:'sensor_native',acceleration:[0,0,9.80665],angularVelocity:[0,0,0],magneticField:[20,0,25]}
const attitude={name:'attitude',coordinateFrame:'sensor_native',quaternion:[1,0,0,0],rollDeg:0,pitchDeg:0,rollSpeed:0,pitchSpeed:0,yawSpeed:0}
function frame(guide,decoded,systemId=1) { guide.receiveFrame({type:'frame',systemId,componentId:191,decoded}) }
function feed(guide,changes={},systemId=1) {
 frame(guide,{...quality,timeBootMs:now,...changes},systemId)
 frame(guide,{...imu,timeUs:String(now*1000)},systemId)
 frame(guide,{...attitude,timeBootMs:now},systemId)
}

const guarded=makeGuide()
guarded.tick(); guarded.advance()
assert.equal(guarded.actionButtonTarget.disabled,true)
assert.equal(guarded.phase,'ready','checking the confirmation cannot start a disconnected procedure')
assert.match(guarded.resultTarget.textContent,/Connect the ground radio/)
guarded.port={close:async()=>{}}
frame(guarded,{...imu,timeUs:String(now*1000)})
frame(guarded,{...attitude,timeBootMs:now})
guarded.advance()
assert.equal(guarded.health.imu,null,'unidentified sensor frames cannot be used')
assert.equal(guarded.phase,'ready')
assert.match(guarded.resultTarget.textContent,/Waiting for recorder identity/)

feed(guarded,{deviceId:'ECU-DEF456'})
guarded.confirmedTarget.checked=true
guarded.advance(); guarded.tick()
assert.equal(guarded.phase,'ready','the connected V1 cannot start the selected V0 calibration')
assert.equal(guarded.actionButtonTarget.disabled,true)
assert.match(guarded.qualityReasonTarget.textContent,/Wrong recorder: ECU-DEF456\. Expected ECU-ABC123/)
assert.equal(guarded.health.quality,null)

now+=100; feed(guarded)
assert.equal(guarded.resultTarget.textContent,'','matching telemetry clears the previous mismatch warning')
guarded.confirmedTarget.checked=false; guarded.tick()
assert.equal(guarded.actionButtonTarget.disabled,true,'identity alone does not replace the ground confirmation')
guarded.confirmedTarget.checked=true; guarded.tick()
assert.equal(guarded.actionButtonTarget.disabled,false,'fresh measurements from the selected recorder enable Start')
guarded.advance()
assert.equal(guarded.phase,'faces')
guarded.faces.completed={'x+':3100}; guarded.rotation=[1,1,1]; guarded.samples=[sample]; guarded.uuid='old-operation'
frame(guarded,{...quality,deviceId:'ECU-DEF456',timeBootMs:now+1})
assert.equal(guarded.phase,'ready','a recorder swap immediately cancels, before the UI timer runs')
assert.equal(guarded.actionButtonTarget.disabled,true)
assert.equal(guarded.confirmedTarget.checked,false)
assert.deepEqual(guarded.faces.completed,{})
assert.deepEqual(guarded.samples,[])
assert.deepEqual(guarded.rotation,[0,0,0])
assert.equal(guarded.uuid,'')

now+=100; feed(guarded)
guarded.confirmedTarget.checked=true; guarded.tick()
now+=1600
guarded.advance()
assert.equal(guarded.phase,'ready','freshness is checked again at click time')
assert.equal(guarded.actionButtonTarget.disabled,true)
assert.match(guarded.resultTarget.textContent,/Waiting for fresh IMU/)

now+=100; feed(guarded)
guarded.confirmedTarget.checked=true; guarded.advance()
guarded.faces.completed={'x+':3100}
now+=100; frame(guarded,{...quality,bootId:43,timeBootMs:now})
assert.equal(guarded.phase,'ready','a boot change invalidates evidence immediately')
assert.deepEqual(guarded.faces.completed,{})
assert.equal(guarded.health.sample(now),null)

now+=100; feed(guarded,{bootId:43})
guarded.confirmedTarget.checked=true; guarded.advance()
frame(guarded,{...quality,deviceId:'ECU-DEF456',timeBootMs:now},2)
assert.equal(guarded.phase,'faces','unrelated radio sources do not replace the selected recorder')
now+=100; frame(guarded,{...quality,bootId:43,timeBootMs:now},3)
assert.equal(guarded.phase,'ready','a source change cannot reuse evidence or sensor frames')
assert.equal(guarded.health.sample(now),null)

let requests=[]
const originalFetch=globalThis.fetch, originalDocument=globalThis.document
globalThis.fetch=async(url,options)=>{
 requests.push(JSON.parse(options.body))
 return {ok:true,json:async()=>({outcome:'passed',summary:{reason:'Passed',roll_mean:0,pitch_mean:0,g_mean:1}})}
}
globalThis.document={querySelector:()=>null}
const saving=makeGuide()
saving.port={close:async()=>{}}
feed(saving,{deviceId:'ECU-DEF456'})
await saving.save()
assert.equal(requests.length,0,'a mismatching recorder cannot submit a reference')
now+=100; feed(saving)
saving.uuid='new-operation'; saving.confirmedTarget.checked=true
await saving.save()
assert.equal(requests.length,1)
assert.equal(requests[0].expected_device_id,'ECU-ABC123')
assert.equal(requests[0].device_id,'ECU-ABC123')
assert.equal(saving.phase,'result')
now+=1600; await saving.save()
assert.equal(requests.length,1,'stale telemetry cannot be saved')
now+=100; feed(saving)
await saving.stop(); await saving.save()
assert.equal(requests.length,1,'disconnect revokes saving even before telemetry would expire')
assert.equal(saving.port,null)
assert.equal(saving.health.quality,null)
globalThis.fetch=originalFetch; globalThis.document=originalDocument

const ended=makeGuide()
ended.port={readable:new ReadableStream({start(controller){controller.close()}}),close:async()=>{}}
feed(ended); ended.confirmedTarget.checked=true; ended.advance()
await ended.read()
assert.equal(ended.port,null,'an ended serial stream revokes the connection immediately')
assert.equal(ended.phase,'ready')
assert.equal(ended.actionButtonTarget.disabled,true)
assert.equal(ended.health.quality,null)

const preflight=makeGuide()
preflight.kindValue='preflight'; preflight.port={}; preflight.loadReference=async()=>{}
feed(preflight,{deviceId:'ECU-DEF456'}); preflight.referenceReady=true; preflight.confirmedTarget.checked=true
preflight.advance()
assert.equal(preflight.phase,'ready','a saved reference never authorizes a different recorder')
now+=100; feed(preflight); preflight.confirmedTarget.checked=true; preflight.referenceReady=false
preflight.advance()
assert.equal(preflight.phase,'ready','the matching recorder still requires a calibration reference for preflight')
preflight.referenceReady=true; preflight.advance()
assert.equal(preflight.phase,'measuring')
Date.now=originalNow
console.log('IMU recorder identity, freshness, disconnect, save guards, diagnostic recovery and reset tests passed')
