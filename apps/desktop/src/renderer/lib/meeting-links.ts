export interface MeetingLink {
  id: string
  name: string
  joinUrl: string
}

interface MeetingProvider {
  id: string
  name: string
  pattern: RegExp
}

const MEETING_PROVIDERS: MeetingProvider[] = [
  { id: "google-meet", name: "Google Meet", pattern: /https?:\/\/meet\.google\.com\/[a-z\-]+/i },
  { id: "zoom", name: "Zoom", pattern: /https?:\/\/[\w\-]*\.?zoom\.us\/[jw]\/\d+[^\s]*/i },
  { id: "zoom-page", name: "Zoom", pattern: /https?:\/\/[\w\-]*\.zm\.page\/[^\s]+/i },
  { id: "zoomgov", name: "Zoom (Gov)", pattern: /https?:\/\/[\w\-]*\.?zoomgov\.com\/[jw]\/\d+[^\s]*/i },
  { id: "teams", name: "Microsoft Teams", pattern: /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s]+/i },
  { id: "teams-live", name: "Microsoft Teams", pattern: /https?:\/\/teams\.live\.com\/meet\/[^\s]+/i },
  { id: "webex", name: "Webex", pattern: /https?:\/\/[\w\-]*\.?webex\.com\/(?:meet|join)\/[^\s]+/i },
  { id: "chime", name: "Amazon Chime", pattern: /https?:\/\/chime\.aws\/\d+/i },
  { id: "jitsi", name: "Jitsi Meet", pattern: /https?:\/\/meet\.jit\.si\/[^\s]+/i },
  { id: "ringcentral", name: "RingCentral", pattern: /https?:\/\/[\w\-]*\.?ringcentral\.com\/[jw]\/\d+/i },
  { id: "gotomeeting", name: "GoTo Meeting", pattern: /https?:\/\/(?:www\.)?gotomeet(?:ing)?\.me\/[^\s]+/i },
  { id: "gotowebinar", name: "GoTo Webinar", pattern: /https?:\/\/(?:attendee\.)?gotowebinar\.com\/[^\s]+/i },
  { id: "bluejeans", name: "BlueJeans", pattern: /https?:\/\/[\w\-]*\.?bluejeans\.com\/\d+/i },
  { id: "8x8", name: "8x8", pattern: /https?:\/\/8x8\.vc\/[^\s]+/i },
  { id: "whereby", name: "Whereby", pattern: /https?:\/\/whereby\.com\/[^\s]+/i },
  { id: "discord", name: "Discord", pattern: /https?:\/\/discord\.gg\/[^\s]+/i },
  { id: "skype", name: "Skype", pattern: /https?:\/\/join\.skype\.com\/[^\s]+/i },
  { id: "facetime", name: "FaceTime", pattern: /https?:\/\/facetime\.apple\.com\/join[^\s]*/i },
  { id: "slack-huddle", name: "Slack Huddle", pattern: /https?:\/\/[\w\-]*\.?slack\.com\/huddle\/[^\s]+/i },
  { id: "around", name: "Around", pattern: /https?:\/\/meet\.around\.co\/[^\s]+/i },
  { id: "gather", name: "Gather Town", pattern: /https?:\/\/(?:app\.)?gather\.town\/[^\s]+/i },
  { id: "tuple", name: "Tuple", pattern: /https?:\/\/tuple\.app\/[^\s]+/i },
  { id: "pop", name: "Pop", pattern: /https?:\/\/pop\.com\/[^\s]+/i },
  { id: "livekit", name: "LiveKit", pattern: /https?:\/\/[\w\-]*\.?livekit\.cloud\/[^\s]+/i },
  { id: "livestorm", name: "Livestorm", pattern: /https?:\/\/app\.livestorm\.co\/[^\s]+/i },
  { id: "luma", name: "Luma", pattern: /https?:\/\/lu\.ma\/[^\s]+/i },
  { id: "cal-video", name: "Cal Video", pattern: /https?:\/\/app\.cal\.com\/video\/[^\s]+/i },
  { id: "streamyard", name: "StreamYard", pattern: /https?:\/\/streamyard\.com\/[^\s]+/i },
  { id: "youtube", name: "YouTube Live", pattern: /https?:\/\/(?:www\.)?youtube\.com\/live\/[^\s]+/i },
  { id: "vimeo", name: "Vimeo", pattern: /https?:\/\/vimeo\.com\/event\/[^\s]+/i },
  { id: "demio", name: "Demio", pattern: /https?:\/\/event\.demio\.com\/[^\s]+/i },
  { id: "vowel", name: "Vowel", pattern: /https?:\/\/[\w\-]*\.?vowel\.com\/[^\s]+/i },
  { id: "lifesize", name: "Lifesize", pattern: /https?:\/\/call\.lifesizecloud\.com\/[^\s]+/i },
  { id: "vonage", name: "Vonage", pattern: /https?:\/\/[\w\-]*\.?vonage\.com\/[^\s]+/i },
  { id: "lark", name: "Lark", pattern: /https?:\/\/[\w\-]*\.?larksuite\.com\/[^\s]+/i },
  { id: "feishu", name: "Feishu", pattern: /https?:\/\/[\w\-]*\.?feishu\.cn\/[^\s]+/i },
  { id: "doxy", name: "Doxy.me", pattern: /https?:\/\/[\w\-]*\.?doxy\.me\/[^\s]+/i },
  { id: "google-hangouts", name: "Google Hangouts", pattern: /https?:\/\/hangouts\.google\.com\/[^\s]+/i },
]

const URL_REGEX = /https?:\/\/[^\s<>"'{}|\\^`[\]]+/gi

export function detectMeetingLink(url: string): MeetingLink | null {
  for (const provider of MEETING_PROVIDERS) {
    const match = url.match(provider.pattern)
    if (match) {
      return {
        id: provider.id,
        name: provider.name,
        joinUrl: match[0],
      }
    }
  }
  return null
}

export function detectMeetingLinkFromText(text: string): MeetingLink | null {
  const urls = text.match(URL_REGEX)
  if (!urls) return null

  for (const url of urls) {
    const link = detectMeetingLink(url)
    if (link) return link
  }
  return null
}

export function detectConferenceLink(event: {
  conferenceLink?: string
  description?: string
  location?: string
  htmlLink?: string
}): MeetingLink | null {
  if (event.conferenceLink) {
    const link = detectMeetingLink(event.conferenceLink)
    if (link) return link
    return { id: "conference", name: "Video Call", joinUrl: event.conferenceLink }
  }

  if (event.description) {
    const link = detectMeetingLinkFromText(event.description)
    if (link) return link
  }

  if (event.location) {
    const link = detectMeetingLinkFromText(event.location)
    if (link) return link
  }

  return null
}
