import assert from 'node:assert/strict'
import * as THREE from 'three'
import {FaceTarget, faceAxis, targetForFace, sensorOrientation, sceneOrientation, figureEightPoint, figureEightOrientation} from '../../app/javascript/lib/imu_tutorial.js'
import {SixFaceCapture} from '../../app/javascript/lib/imu_health.js'
const close = (value, expected) => assert.ok(Math.abs(value-expected)<1e-8,`${value} != ${expected}`)
const identity = sensorOrientation([1,0,0,0])
// The hand path closes smoothly, crosses its center twice, and has two lobes.
close(figureEightPoint(0).distanceTo(figureEightPoint(Math.PI*2)),0)
close(figureEightPoint(0).length(),0)
close(figureEightPoint(Math.PI).length(),0)
assert.ok(figureEightPoint(Math.PI/2).x>2)
assert.ok(figureEightPoint(Math.PI*1.5).x<-2)
assert.ok(figureEightPoint(Math.PI/4).y>.7)
assert.ok(figureEightPoint(Math.PI*3/4).y<-.7)
const startVelocity = figureEightPoint(.0001).sub(figureEightPoint(0))
const endVelocity = figureEightPoint(Math.PI*2+.0001).sub(figureEightPoint(Math.PI*2))
close(startVelocity.distanceTo(endVelocity),0)
close(Math.abs(figureEightOrientation(0).dot(figureEightOrientation(Math.PI*2))),1)
for (let p=0;p<Math.PI*2;p+=.05) {
  close(figureEightOrientation(p).length(),1)
  assert.ok(figureEightOrientation(p).angleTo(figureEightOrientation(p+.05))<.15,'wrist motion remains continuous')
}
const up = new THREE.Vector3(0,0,1).applyQuaternion(sceneOrientation(identity))
close(up.x,0);close(up.y,1);close(up.z,0)
const roll = sensorOrientation([Math.SQRT1_2,Math.SQRT1_2,0,0])
close(faceAxis('y+').applyQuaternion(sceneOrientation(roll)).y,1)
for (const yaw of [0,.8,2.7,4.9]) for(const face of ['x+','x-','y+','y-','z+','z-']) {
  const measured = new THREE.Quaternion().setFromEuler(new THREE.Euler(.6,-.9,yaw))
  const target = targetForFace(measured,face)
  close(faceAxis(face).applyQuaternion(target).z,1)
  close(faceAxis(face).applyQuaternion(sceneOrientation(target)).y,1)
  const sameTarget = targetForFace(target,face)
  close(Math.abs(sameTarget.dot(target)),1)
}
// An already aligned sensor can keep any heading; the target must not demand north.
for(const yaw of [0,.8,2.7,4.9]) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),yaw)
  close(Math.abs(targetForFace(q,'z+').dot(q)),1)
}
const fixed = new FaceTarget()
fixed.update('x+', null)
const initialPose = sensorOrientation([Math.cos(.3),0,0,Math.sin(.3)])
const locked = fixed.update('x+', initialPose).clone()
// Lifting X and rotating the sensor must not make the target chase the sensor.
for (let tilt=0;tilt<=Math.PI;tilt+=.05) {
  const moving = new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,tilt,tilt/2))
  close(Math.abs(fixed.update('x+',moving).dot(locked)),1)
}
close(Math.abs(fixed.update('x+',null).dot(locked)),1)
const next = fixed.update('x-',initialPose).clone()
close(faceAxis('x-').applyQuaternion(next).z,1)
assert.ok(Math.abs(next.dot(locked))<.01,'a new face receives its own target')
fixed.reset()
close(Math.abs(fixed.update('x+',identity).dot(targetForFace(identity,'x+'))),1)
// Each opposite pair is an exact half-turn in one shared frame, regardless of
// the sensor heading or hand position when the next step begins.
for (const yaw of [0,.7,2.4,5.1]) {
  const paired = new FaceTarget()
  const reference = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),yaw)
  paired.update('z+',reference)
  for (const axis of ['x','y','z']) {
    const plus = paired.update(`${axis}+`,new THREE.Quaternion().setFromEuler(new THREE.Euler(.4,1.2,2.1))).clone()
    const minus = paired.update(`${axis}-`,new THREE.Quaternion().setFromEuler(new THREE.Euler(2.7,-.8,-1.5))).clone()
    close(plus.angleTo(minus),Math.PI)
    const vector = faceAxis(`${axis}+`)
    close(vector.clone().applyQuaternion(plus).dot(vector.clone().applyQuaternion(minus)),-1)
    const hinge = faceAxis(axis === 'x' ? 'y+' : 'x+')
    close(hinge.clone().applyQuaternion(plus).dot(hinge.clone().applyQuaternion(minus)),1)
    close(faceAxis(`${axis}+`).applyQuaternion(plus).z,1)
    close(faceAxis(`${axis}-`).applyQuaternion(minus).z,1)
    close(Math.abs(paired.update(`${axis}+`,null).dot(plus)),1)
  }
  close(Math.abs(paired.update('z+',identity).dot(reference)),1)
}
const faces = new SixFaceCapture()
const sample = (t,accel=[9.80665,0,0],gyro=[0,0,0]) => ({t,accel,gyro})
for(let t=0;t<=4000;t+=100) faces.add(sample(t,[0,0,9.80665]),'x+')
assert.deepEqual(faces.completed,{},'a stable wrong face cannot advance the active step')
assert.equal(faces.aligned,false)
for(let t=4100;t<=6000;t+=100)faces.add(sample(t),'x+')
assert.equal(faces.dwell,1900)
faces.add(sample(6100,[9.80665,0,0],[.4,0,0]),'x+')
assert.equal(faces.dwell,0,'movement resets the hold')
for(let t=6200;t<=9100;t+=100)faces.add(sample(t),'x+')
assert.equal(faces.completed['x+'],undefined,'less than three continuous seconds is insufficient')
faces.add(sample(9200),'x+')
assert.equal(faces.completed['x+'],3000)
faces.add(null,'x-')
assert.equal(faces.aligned,false)
assert.equal(faces.dwell,0,'stale data cannot leave a moving countdown')
const tilted = (t, degrees, rate=.1) => sample(t,[9.80665*Math.cos(degrees*Math.PI/180),0,9.80665*Math.sin(degrees*Math.PI/180)],[rate,0,0])
const handheld = new SixFaceCapture()
handheld.add(tilted(0,18),'x+')
assert.equal(handheld.aligned,false,'the wider hold margin cannot start a new hold')
handheld.add(tilted(100,14),'x+')
assert.equal(handheld.aligned,true,'rough alignment and small hand movement can start a hold')
for(let t=200;t<=3100;t+=100)handheld.add(tilted(t,t%200?19:16),'x+')
assert.equal(handheld.completed['x+'],3000,'small wobble across the entry boundary preserves the countdown')
handheld.add(tilted(3200,21),'x+')
assert.equal(handheld.dwell,0,'leaving the hold zone resets the countdown')
handheld.add(tilted(3300,18),'x+')
assert.equal(handheld.aligned,false,'a reset requires entering the inner zone again')
handheld.add(tilted(3400,14),'x+')
handheld.add(tilted(3500,14,.4),'x+')
assert.equal(handheld.dwell,0,'deliberate movement still resets the hold')
handheld.add(tilted(3600,14),'x+')
handheld.add(tilted(4100,19),'x+')
assert.equal(handheld.aligned,false,'a data gap cannot preserve the wider hold margin')
console.log('Native orientation, fixed face targets, handheld tolerance and measured hold timing tests passed')
