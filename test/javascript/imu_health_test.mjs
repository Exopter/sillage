import assert from 'node:assert/strict'
import { ImuHealth, SixFaceCapture, ReferenceCapture, referenceIssue, imuQualityLabel } from '../../app/javascript/lib/imu_health.js'
const q = {name:'imu_quality',deviceId:'ECU-A172E0',bootId:42,imuEpoch:1,firmware:'fdr_integrated/56',timeBootMs:1000,headingAccuracyDeg:3,accuracy:[3,3,3,3],agesMs:[1,1,1,1],validity:120}
const imu = {name:'highres_imu',coordinateFrame:'sensor_native',timeUs:'1000000',acceleration:[0,0,9.80665],angularVelocity:[0,0,0],magneticField:[20,0,25]}
const attitude = {name:'attitude',coordinateFrame:'sensor_native',timeBootMs:1000,quaternion:[1,0,0,0],rollDeg:0,pitchDeg:0,rollSpeed:0,pitchSpeed:0,yawSpeed:0}
const health = new ImuHealth()
assert.equal(health.status(1000).attitude,'unknown')
function feed(time, change={}) {
  health.apply({...q,timeBootMs:time,...change},time)
  health.apply({...imu,timeUs:String(time*1000)},time)
  health.apply({...attitude,timeBootMs:time},time)
}
feed(1000)
assert.equal(health.status(1000).attitude,'consistent')
assert.equal(referenceIssue(health.sample(1000)),null)
assert.equal(health.sample(3000),null,'a heartbeat or stale quality cannot validate the reference')
feed(4000,{accuracy:[3,3,0,3]}); health.status(4000)
feed(6100,{accuracy:[3,3,0,3]})
assert.equal(health.status(6100).heading,'degraded')
assert.equal(health.status(6100).attitude,'consistent','magnetic quality is separate')
feed(7000)
health.apply({...imu,timeUs:'7100000',acceleration:[0,0,19.6133]},7100)
assert.equal(health.status(7100).issues.includes('gravity_attitude_mismatch'),false,'2 g during flight is not a calibration fault')
health.apply({...q,timeBootMs:50,bootId:43},7200)
assert.equal(health.generation,1)
assert.equal(health.sample(7200),null,'pre-reboot sensor values are discarded')
health.apply({...q,timeBootMs:60,bootId:43,imuEpoch:2},7300)
assert.equal(health.generation,2,'IMU-only resets invalidate a reference too')
const faces = new SixFaceCapture()
let t=0
for (const [axis,sign] of [[0,1],[0,-1],[1,1],[1,-1],[2,1],[2,-1]]) {
  for (let n=0;n<33;n++) {
    t+=100; const accel=[0,0,0];accel[axis]=sign*9.80665
    faces.add({t,accel,gyro:[0,0,0]})
  }
}
assert.equal(faces.done,true)
const interrupted = new SixFaceCapture()
for (let n=0;n<29;n++) interrupted.add({t:n*100,accel:[0,0,9.80665],gyro:[0,0,0]})
interrupted.add(null)
interrupted.add({t:10000,accel:[0,0,9.80665],gyro:[0,0,0]})
assert.equal(interrupted.done,false,'separate partial dwells do not count as a continuous hold')
// A 30-degree quaternion jump with zero angular velocity is explicitly inconsistent.
feed(9000); health.status(9000)
health.apply({...attitude,timeBootMs:9100,quaternion:[Math.cos(Math.PI/12),0,0,Math.sin(Math.PI/12)]},9100)
assert.ok(health.status(9100).issues.includes('gyro_attitude_mismatch'))
console.log('IMU confidence, stale data, reboot, sensor cross-check and six-face tests passed')

feed(20000)
const contradictory = {...health.sample(20000), accel:[4.903325,0,8.492808]}
assert.match(referenceIssue(contradictory), /gravity/, 'a level horizon cannot hide an acceleration tilt')

const goodSample = health.sample(20000)
const lowGyroSample = {...goodSample, accuracy:[2,0,3,3]}
assert.equal(referenceIssue(lowGyroSample), null, 'verified BNO085 status zero is diagnostic, with measured rates retained')
assert.match(referenceIssue({...lowGyroSample,firmware:'fdr_integrated/57'}), /Gyroscope 0\/3/, 'unknown firmware keeps the accuracy gate')
assert.match(referenceIssue({...lowGyroSample,accuracy:[2,255,3,3]}), /Gyroscope unavailable/, 'missing gyro reports still block')
assert.match(referenceIssue({...lowGyroSample,gyro:[0.05,0,0]}), /still/, 'status exception cannot bypass a measured excessive rotation')
assert.equal(imuQualityLabel(0,1,'fdr_integrated/56'),'Gyroscope status 0 (diagnostic)')
feed(23000,{accuracy:[3,0,3,3]}); health.status(23000)
feed(25100,{accuracy:[3,0,3,3]})
assert.equal(health.status(25100).attitude,'consistent')
feed(26000,{accuracy:[3,0,3,3],firmware:'fdr_integrated/57'}); health.status(26000)
feed(28100,{accuracy:[3,0,3,3],firmware:'fdr_integrated/57'})
assert.equal(health.status(28100).attitude,'degraded')
feed(29000,{accuracy:[3,255,3,3]})
assert.equal(health.status(29000).attitude,'unknown')
const diagnostic = new ReferenceCapture(0)
for (let time=0;time<=15000;time+=100) diagnostic.add({...lowGyroSample,t:time},time)
assert.equal(diagnostic.done,true,'persistent low quality must produce a bounded diagnostic, not an endless wait')
assert.equal(diagnostic.samples.length,151)
assert.ok(diagnostic.samples.every(sample=>sample.accuracy[1]===0),'preserve the original status in server evidence')
const gap = new ReferenceCapture(0)
for (let time=0;time<10000;time+=100) gap.add({...goodSample,t:time},time)
gap.add(null,10000)
gap.add({...goodSample,t:10100},10100)
assert.equal(gap.elapsed,0,'data loss restarts the continuous recording')
gap.add({...goodSample,t:10100},10200)
assert.equal(gap.samples.length,1,'duplicates cannot advance observation time')
assert.equal(gap.expired(45000),true,'data interruption has a fixed deadline')
const frozen = new ReferenceCapture(0)
for(let time=0;time<=45000;time+=100) frozen.add({...goodSample,t:0},time)
assert.equal(frozen.done,false)
assert.equal(frozen.expired(45000),true,'frozen timestamps cannot keep the tutorial running forever')
const retry = new ReferenceCapture(46000)
for(let time=46000;time<=61000;time+=100) retry.add({...goodSample,t:time},time)
assert.equal(retry.done,true,'a new attempt starts a fresh complete observation')
