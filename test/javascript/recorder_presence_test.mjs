import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import {observeRecorderConnection, forgetRecorderConnection} from "../../app/javascript/lib/aircraft_connection.js"
const connectionURL = new URL('../../app/javascript/lib/aircraft_connection.js', import.meta.url).href
let source = await readFile(new URL('../../app/javascript/controllers/recorder_presence_controller.js', import.meta.url), 'utf8')
source = source.replace('import { Controller } from "@hotwired/stimulus"', 'class Controller {}').replace('from "aircraft_connection"', `from "${connectionURL}"`)
const {default: Presence} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
globalThis.window = {setInterval() {return 1}, clearInterval() {}}
globalThis.document = {querySelector() {return {getAttribute() {return 'csrf'}}}}
const requests = []
globalThis.fetch = async (url, options) => new Promise(resolve => requests.push({url, body:JSON.parse(options.body), resolve}))
const reporter = new Presence()
reporter.connect()
assert.equal(requests.length, 0, 'idle pages do not submit empty snapshots')
observeRecorderConnection('usb-c', {deviceId:'ECU-E072A1F81D84',firmware:'fdr_integrated/57'})
const pending = reporter.report()
assert.equal(requests.length, 1)
await reporter.report()
assert.equal(requests.length, 1, 'slow requests cannot overlap and arrive out of order')
assert.equal(requests[0].body.observations[0].firmware, 'fdr_integrated/57')
reporter.disconnect()
requests[0].resolve({ok:true})
await pending
assert.equal(requests.length, 2, 'navigation clears the lease after an in-flight snapshot finishes')
assert.deepEqual(requests[1].body.observations, [])
assert.equal(requests[1].body.observer_id, requests[0].body.observer_id)
requests[1].resolve({ok:true})
forgetRecorderConnection('usb-c')
console.log('Recorder presence lifecycle tests passed')
