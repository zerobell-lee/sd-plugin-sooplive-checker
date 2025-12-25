import { Action, action, DidReceiveSettingsEvent, KeyAction, KeyDownEvent, KeyUpEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";
import axios from "axios";
import cookieParser, { Cookie } from "set-cookie-parser";


/**
 * An example action class that displays a count that increments by one each time the button is pressed.
 */
@action({ UUID: "com.zerobell-lee.sooplive-checker.check" })
export class StreamChecker extends SingletonAction<SoopCheckerSettings> {
	private timers: Map<string, NodeJS.Timeout> = new Map();
	private states: Map<string, number> = new Map();
	private fetchIntervals: Map<string, number> = new Map();
	private cookieDict: Cookie[] = Array<Cookie>();

	/**
	 * The {@link SingletonAction.onWillAppear} event is useful for setting the visual representation of an action when it becomes visible. This could be due to the Stream Deck first
	 * starting up, or the user navigating between pages / folders etc.. There is also an inverse of this event in the form of {@link streamDeck.client.onWillDisappear}. In this example,
	 * we're setting the title to the "count" that is incremented in {@link IncrementCounter.onKeyDown}.
	 */
	override onWillAppear(ev: WillAppearEvent<SoopCheckerSettings>): void | Promise<void> {
		this.registerSchedule(ev)
	}

	private registerSchedule(ev: WillAppearEvent<SoopCheckerSettings> | DidReceiveSettingsEvent<SoopCheckerSettings>) {
		const context = ev.action.id;

		if (!this.timers.has(context)) {
			streamDeck.logger.debug("Fetch interval = " + ev.payload.settings.fetch_interval)
			if (ev.payload.settings.fetch_interval !== undefined) {
				let fetchInterval = 5000;
				try {
					let parsedInterval = parseInt(ev.payload.settings.fetch_interval)
					if (parsedInterval < 1000 && parsedInterval > 0) {
						fetchInterval = 1000
					} else if (parsedInterval >= 1000) {
						fetchInterval = parsedInterval
					}
				} catch (error) {
					streamDeck.logger.warn("Failed to parse Int,", error)
				}

				this.fetchIntervals.set(context, fetchInterval);
				this.states.set(context, 0);

				const timer = setInterval(async () => {
					if (ev.action.isKey()) {
						const state = await this.checkStreaming(ev.payload.settings) === true ? 1 : 0;
						this.states.set(context, state);
						ev.action.setState(state);
					}
				}, fetchInterval);

				this.timers.set(context, timer);
			}
		}
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<SoopCheckerSettings>): Promise<void> | void {
		const context = ev.action.id;
		const currentInterval = this.fetchIntervals.get(context) || 5000;

		let newInterval = currentInterval;
		try {
			newInterval = this.safeParseInt(ev.payload.settings.fetch_interval);
		} catch (error) {
			// Keep current interval
		}

		if (newInterval !== currentInterval) {
			const timer = this.timers.get(context);
			if (timer) {
				clearInterval(timer);
				this.timers.delete(context);
			}
			this.registerSchedule(ev);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<SoopCheckerSettings>): Promise<void> | void {
		const context = ev.action.id;
		const timer = this.timers.get(context);
		if (timer) {
			clearInterval(timer);
			this.timers.delete(context);
		}
		this.states.delete(context);
		this.fetchIntervals.delete(context);
	}

	/**
	 * Listens for the {@link SingletonAction.onKeyDown} event which is emitted by Stream Deck when an action is pressed. Stream Deck provides various events for tracking interaction
	 * with devices including key down/up, dial rotations, and device connectivity, etc. When triggered, {@link ev} object contains information about the event including any payloads
	 * and action information where applicable. In this example, our action will display a counter that increments by one each press. We track the current count on the action's persisted
	 * settings using `setSettings` and `getSettings`.
	 */
	override async onKeyDown(ev: KeyDownEvent<SoopCheckerSettings>): Promise<void> {
		const context = ev.action.id;
		const state = this.states.get(context) || 0;
		ev.action.setState(state);
		const streamerId = ev.payload.settings.streamer_id;
		streamDeck.system.openUrl("https://play.sooplive.co.kr/" + streamerId);
	}

	override async onKeyUp(ev: KeyUpEvent<SoopCheckerSettings>): Promise<void> {
		const context = ev.action.id;
		const state = this.states.get(context) || 0;
		ev.action.setState(state);
	}

	private async checkStreaming(setting: SoopCheckerSettings): Promise<boolean> {
		// await this.getCookie(setting.my_id, setting.my_password)
		streamDeck.logger.debug(this.cookieDict)

		const url = "https://live.sooplive.co.kr/afreeca/player_live_api.php";
		const data = {
			bid: setting.streamer_id,
			quality: "original",
			type: "aid",
			pwd: "",
			stream_type: "common",
		};

		try {
			const response = await axios.post(url, new URLSearchParams(data).toString(), {
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					"Cookie": this.cookieDict.map(cookie => `${cookie.name}=${cookie.value}`).join("; "),  // 쿠키 포함
				},
			});

			const result = response.data;

			if (result.CHANNEL.RESULT === 0) {
				return false;  // 방송 중 아님
			} else if (result.CHANNEL.RESULT === 1) {
				return true;  // 방송 중
			} else if (result.CHANNEL.RESULT === -6) {
				return true; // Streaming. But member-only or adult-only
			}else {
				return false;  // 결과를 알 수 없음
			}
		} catch (error) {
			streamDeck.logger.error("Error during stream check:", error);
			return false;
		}
	}

	private safeParseInt(str: string | undefined) {
		if (str === undefined) {
			throw new Error('Invalid number format');
		}
		if (/^\d+$/.test(str)) {
			return parseInt(str, 10);
		} else {
			throw new Error('Invalid number format');
		}
	}
}

streamDeck.connect();

type SoopCheckerSettings = {
	streamer_id: string;
	fetch_interval: string | undefined;
}