import { Controller } from "@hotwired/stimulus"
import { createMembershipCard, PRESENTED } from "membership_card"

/**
 * @typedef {Object} StimulusBindings
 * @property {string} nameValue
 * @property {number} numberValue
 * @property {string} tierValue
 * @property {string} sinceValue
 * @property {string} wordmarkValue
 * @property {string} monogramValue
 * @property {string} wingValue
 * @property {HTMLElement} sceneTarget
 * @property {HTMLElement} fallbackTarget
 * @property {HTMLElement} announcementTarget
 * @property {HTMLElement} turnLabelTarget
 * @property {boolean} hasTurnLabelTarget
 */
const TypedController = /** @type {new (context: import("@hotwired/stimulus").Context) => Controller<HTMLElement> & StimulusBindings} */ (/** @type {unknown} */ (Controller))

/** Seconds the invitation copy takes to clear before the card sequence starts. */
const PRELUDE_EXIT = 0.6

/**
 * Presents a Flight Club membership card. The element's `data-stage` drives the
 * page: `invitation` before the reveal, `revealing` during the sequence and
 * `presented` once the card has been shown in full.
 */
export default class extends TypedController {
  static targets = ["scene", "fallback", "announcement", "turnLabel"]
  static values = {
    name: String,
    number: Number,
    tier: String,
    since: String,
    wordmark: String,
    monogram: String,
    wing: String
  }

  /** @type {import("membership_card").MembershipCard | null} */
  card = null
  /** @type {number | undefined} */
  presentedTimer = undefined
  connected = false

  connect() {
    this.connected = true
    createMembershipCard(this.sceneTarget, {
      name: this.nameValue,
      memberNumber: this.numberValue,
      tier: /** @type {import("membership_card").RankKey} */ (this.tierValue),
      since: this.sinceValue,
      assets: { wordmark: this.wordmarkValue, monogram: this.monogramValue, wing: this.wingValue },
      onFace: (flipped) => this.showFace(flipped)
    }).then((card) => {
      if (!this.connected) return card.dispose()
      this.card = card
    }).catch((error) => {
      // Without WebGL the member still meets a static card and can continue.
      this.fallbackTarget.hidden = false
      this.sceneTarget.hidden = true
      console.error("Membership card could not initialize.", error)
    })
  }

  disconnect() {
    this.connected = false
    window.clearTimeout(this.presentedTimer)
    this.card?.dispose()
    this.card = null
  }

  reveal() {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches
    window.clearTimeout(this.presentedTimer)
    this.element.dataset.stage = "revealing"
    this.card?.reveal(PRELUDE_EXIT)
    this.presentedTimer = window.setTimeout(() => {
      this.element.dataset.stage = "presented"
      this.announcementTarget.textContent = `Welcome, ${this.nameValue}. Your membership card has been revealed.`
    }, still || !this.card ? 0 : (PRELUDE_EXIT + PRESENTED) * 1000)
  }

  turn() {
    this.card?.turn()
  }

  /** @param {boolean} flipped */
  showFace(flipped) {
    if (this.hasTurnLabelTarget) this.turnLabelTarget.textContent = flipped ? "Show front" : "Turn card"
    this.announcementTarget.textContent = flipped ? "Reverse of the membership card: The story is ours to write." : "Front of the membership card."
  }
}
