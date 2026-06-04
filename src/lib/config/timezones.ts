export interface Timezone {
  iana: string;
  display: string;
  offset: string;
}

export const TIMEZONES: Timezone[] = [
  { iana: 'Africa/Lagos', display: 'Lagos (Nigeria)', offset: '+01:00' },
  { iana: 'Africa/Nairobi', display: 'Nairobi (Kenya)', offset: '+03:00' },
  { iana: 'Africa/Accra', display: 'Accra (Ghana)', offset: '+00:00' },
  { iana: 'Africa/Johannesburg', display: 'Johannesburg (South Africa)', offset: '+02:00' },
  { iana: 'Africa/Cairo', display: 'Cairo (Egypt)', offset: '+02:00' },
  { iana: 'America/New_York', display: 'New York (Eastern)', offset: '-05:00' },
  { iana: 'America/Chicago', display: 'Chicago (Central)', offset: '-06:00' },
  { iana: 'America/Denver', display: 'Denver (Mountain)', offset: '-07:00' },
  { iana: 'America/Los_Angeles', display: 'Los Angeles (Pacific)', offset: '-08:00' },
  { iana: 'America/Toronto', display: 'Toronto (Eastern)', offset: '-05:00' },
  { iana: 'America/Sao_Paulo', display: 'São Paulo (Brazil)', offset: '-03:00' },
  { iana: 'America/Mexico_City', display: 'Mexico City', offset: '-06:00' },
  { iana: 'Europe/London', display: 'London (GMT)', offset: '+00:00' },
  { iana: 'Europe/Paris', display: 'Paris (Central European)', offset: '+01:00' },
  { iana: 'Europe/Berlin', display: 'Berlin (Central European)', offset: '+01:00' },
  { iana: 'Asia/Dubai', display: 'Dubai (Gulf)', offset: '+04:00' },
  { iana: 'Asia/Kolkata', display: 'Mumbai / New Delhi (IST)', offset: '+05:30' },
  { iana: 'Asia/Karachi', display: 'Karachi (PKT)', offset: '+05:00' },
  { iana: 'Asia/Dhaka', display: 'Dhaka (BST)', offset: '+06:00' },
  { iana: 'Asia/Manila', display: 'Manila (Philippines)', offset: '+08:00' },
  { iana: 'Asia/Jakarta', display: 'Jakarta (WIB)', offset: '+07:00' },
  { iana: 'Asia/Kuala_Lumpur', display: 'Kuala Lumpur (MYT)', offset: '+08:00' },
  { iana: 'Asia/Shanghai', display: 'Shanghai / Beijing (CST)', offset: '+08:00' },
  { iana: 'Asia/Tokyo', display: 'Tokyo (JST)', offset: '+09:00' },
  { iana: 'Australia/Sydney', display: 'Sydney (AEDT)', offset: '+11:00' },
  { iana: 'Pacific/Auckland', display: 'Auckland (NZDT)', offset: '+13:00' },
  { iana: 'UTC', display: 'UTC', offset: '+00:00' },
];
