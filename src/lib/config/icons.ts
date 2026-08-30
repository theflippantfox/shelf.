export const ICONS = {
  // Navigation
  dashboard: 'LayoutDashboard',
  sale:      'ShoppingCart',
  inventory: 'Package',
  customers: 'Users',
  history:   'ClipboardList',
  analytics: 'BarChart2',
  settings:  'Settings',

  // Actions
  add:       'Plus',
  edit:      'Pencil',
  delete:    'Trash2',
  archive:   'Archive',
  restore:   'ArchiveRestore',
  save:      'Check',
  cancel:    'X',
  close:     'X',
  search:    'Search',
  filter:    'SlidersHorizontal',
  sort:      'ArrowUpDown',
  export:    'Download',
  import:    'Upload',
  print:     'Printer',
  refresh:   'RefreshCw',
  copy:      'Copy',
  share:     'Share2',
  void:      'Ban',
  confirm:   'CheckCircle',
  back:      'ArrowLeft',
  forward:   'ArrowRight',
  expand:    'ChevronDown',
  collapse:  'ChevronUp',
  restock:   'PackagePlus',
  drag:      'GripVertical',
  invite:    'UserPlus',
  removeUser:'UserMinus',

  // Status
  alert:      'Bell',
  alertActive:'BellDot',
  warning:    'AlertTriangle',
  error:      'AlertCircle',
  success:    'CheckCircle2',
  info:       'Info',
  lowStock:   'TrendingDown',
  outOfStock: 'PackageX',
  inStock:    'PackageCheck',

  // Financial
  cash:     'Banknote',
  credit:   'CreditCard',
  transfer: 'ArrowLeftRight',
  revenue:  'TrendingUp',
  profit:   'DollarSign',
  tax:      'Percent',
  discount: 'Tag',
  receipt:  'Receipt',

  // Users
  user:     'User',
  owner:    'Crown',
  manager:  'ShieldCheck',
  cashier:  'UserCheck',
  login:    'LogIn',
  logout:   'LogOut',
  password: 'Lock',
  email:    'Mail',
  phone:    'Phone',
  avatar:   'CircleUser',

  // Shop
  shop:        'Store',
  theme:       'Palette',
  darkMode:    'Moon',
  lightMode:   'Sun',
  systemMode:  'Monitor',
  currency:    'CircleDollarSign',
  timezone:    'Clock',
  language:    'Globe',
  notifications:'Bell',
  permissions: 'ShieldHalf',
  location:    'MapPin',
  website:     'Link',

  // Categories - Beauty & Personal Care
  skincare:    'sparkles',
  makeup:      'wand-2',
  haircare:    'scissors',
  fragrance:   'wind',
  bodycare:    'droplets',
  nails:       'brush',
  wellness:    'heart',
  spa:         'flower',
  
  // Categories - Fashion & Accessories
  accessories: 'watch',
  clothing:    'shirt',
  jewelry:     'diamond',
  glasses:     'glasses',
  bag:         'backpack',
  shoe:        'footprints',
  
  // Categories - Tools & Equipment
  tools:       'wrench',
  brush:       'brush',
  hammer:      'hammer',
  
  // Categories - Health & Nutrition
  supplements: 'pill',
  medical:     'stethoscope',
  nutrition:   'apple',
  fitness:     'activity',
  
  // Categories - Home & Living
  home:        'home',
  food:        'shopping-bag',
  garden:      'flower-2',
  flower2:     'flower-2',
  kitchen:     'coffee',
  furniture:   'armchair',
  
  // Categories - Electronics & Tech
  electronics: 'zap',
  smartphone:  'smartphone',
  computer:    'laptop',
  camera:      'camera',
  
  // Categories - Sports & Recreation
  sports:      'dumbbell',
  toys:        'gamepad-2',
  music:       'music',
  gaming:      'gamepad',
  
  // Categories - Professional & Creative
  art:         'paint-bucket',
  books:       'book-open',
  office:      'briefcase',
  education:   'graduation-cap',
  
  // Categories - Vehicles & Transport
  automotive:  'car',
  truck:       'Truck',
  bicycle:     'bike',
  
  // Categories - Animals & Gifts
  pets:        'paw-print',
  gifts:       'gift',
  baby:        'baby',
  party:       'party-popper',
} as const;

export type IconKey = keyof typeof ICONS;
export type IconName = typeof ICONS[IconKey];

export const CATEGORY_ICON_KEYS: IconKey[] = [
  // Beauty & Personal Care
  'skincare','makeup','haircare','fragrance','bodycare','nails','wellness','spa',
  // Fashion & Accessories
  'accessories','clothing','jewelry','glasses','bag','shoe',
  // Tools & Equipment
  'tools','brush','hammer',
  // Health & Nutrition
  'supplements','medical','nutrition','fitness',
  // Home & Living
  'home','food','garden','flower2','kitchen','furniture',
  // Electronics & Tech
  'electronics','smartphone','computer','camera',
  // Sports & Recreation
  'sports','toys','music','gaming',
  // Professional & Creative
  'art','books','office','education',
  // Vehicles & Transport
  'automotive','truck','bicycle',
  // Animals & Gifts
  'pets','gifts','baby','party',
];
