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
  skincare:    'Sparkles',
  makeup:      'WandSparkles',
  haircare:    'Scissors',
  fragrance:   'Wind',
  bodycare:    'Droplets',
  nails:       'Brush',
  wellness:    'Heart',
  spa:         'Flower',

  // Categories - Fashion & Accessories
  accessories: 'Watch',
  clothing:    'Shirt',
  jewelry:     'Diamond',
  glasses:     'Glasses',
  bag:         'Backpack',
  shoe:        'Footprints',

  // Categories - Tools & Equipment
  tools:       'Wrench',
  brush:       'Brush',
  hammer:      'Hammer',

  // Categories - Health & Nutrition
  supplements: 'Pill',
  medical:     'Stethoscope',
  nutrition:   'Apple',
  fitness:     'Activity',

  // Categories - Home & Living
  home:        'House',
  food:        'ShoppingBag',
  garden:      'Flower2',
  flower2:     'Flower2',
  kitchen:     'Coffee',
  furniture:   'Armchair',

  // Categories - Electronics & Tech
  electronics: 'Zap',
  smartphone:  'Smartphone',
  computer:    'Laptop',
  camera:      'Camera',

  // Categories - Sports & Recreation
  sports:      'Dumbbell',
  toys:        'Gamepad2',
  music:       'Music',
  gaming:      'Gamepad',

  // Categories - Professional & Creative
  art:         'PaintBucket',
  books:       'BookOpen',
  office:      'Briefcase',
  education:   'GraduationCap',

  // Categories - Vehicles & Transport
  automotive:  'Car',
  truck:       'Truck',
  bicycle:     'Bike',

  // Categories - Animals & Gifts
  pets:        'PawPrint',
  gifts:       'Gift',
  baby:        'Baby',
  party:       'PartyPopper',
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
