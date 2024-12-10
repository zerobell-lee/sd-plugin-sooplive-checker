import { Action, action, DidReceiveSettingsEvent, KeyAction, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";
import axios from "axios";
import cookieParser, { Cookie } from "set-cookie-parser";


/**
 * An example action class that displays a count that increments by one each time the button is pressed.
 */
@action({ UUID: "com.zerobell-lee.sooplive-checker.check" })
export class StreamChecker extends SingletonAction<SoopCheckerSettings> {
	private timer: NodeJS.Timeout | undefined;
	private state: number = 0;
	private fetchInterval: number = 5000;
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
		if (!this.timer) {
			streamDeck.logger.debug("Fetch interval = " + ev.payload.settings.fetch_interval)
			if (ev.payload.settings.fetch_interval !== undefined) {
				try {
					let fetchInterval = parseInt(ev.payload.settings.fetch_interval)
					if (fetchInterval < 1000 && fetchInterval > 0) {
						this.fetchInterval = 1000
					} else if (fetchInterval >= 1000) {
						this.fetchInterval = fetchInterval
					}
				} catch (error) {
					streamDeck.logger.warn("Failed to parse Int,", error)
				}

				this.timer = setInterval(async () => {
					if (ev.action.isKey()) {
						this.state = await this.checkStreaming(ev.payload.settings) === true ? 1 : 0;
						ev.action.setState(this.state);
					}
				}, this.fetchInterval);
			}
		}
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<SoopCheckerSettings>): Promise<void> | void {
		let newTimeout = this.fetchInterval
		try {
			newTimeout = this.safeParseInt(ev.payload.settings.fetch_interval)
		} catch (error) {

		}

		if (newTimeout !== this.fetchInterval) {
			clearInterval(this.timer);
			this.timer = undefined;
			this.registerSchedule(ev);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<SoopCheckerSettings>): Promise<void> | void {
		clearInterval(this.timer);
		this.timer = undefined;
	}

	/**
	 * Listens for the {@link SingletonAction.onKeyDown} event which is emitted by Stream Deck when an action is pressed. Stream Deck provides various events for tracking interaction
	 * with devices including key down/up, dial rotations, and device connectivity, etc. When triggered, {@link ev} object contains information about the event including any payloads
	 * and action information where applicable. In this example, our action will display a counter that increments by one each press. We track the current count on the action's persisted
	 * settings using `setSettings` and `getSettings`.
	 */
	override async onKeyDown(ev: KeyDownEvent<SoopCheckerSettings>): Promise<void> {
		const streamerId = ev.payload.settings.streamer_id
		streamDeck.system.openUrl("https://play.sooplive.co.kr/" + streamerId);
	}

	private async checkStreaming(setting: SoopCheckerSettings): Promise<boolean> {
		// await this.getCookie(setting.my_id, setting.my_password)
		streamDeck.logger.debug(this.cookieDict)

		const url = "https://live.afreecatv.com/afreeca/player_live_api.php";
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
			} else {
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