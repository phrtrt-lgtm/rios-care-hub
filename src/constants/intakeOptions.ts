// Catálogo de opções para o wizard de cadastro de imóveis
export const BED_TYPES = [
  { value: "casal_queen", label: "Cama de casal Queen" },
  { value: "casal_king", label: "Cama de casal King" },
  { value: "casal_padrao", label: "Cama de casal padrão" },
  { value: "solteiro", label: "Cama de solteiro" },
  { value: "solteiro_king", label: "Solteiro King (super solteiro)" },
  { value: "beliche", label: "Beliche" },
  { value: "bicama", label: "Bicama" },
  { value: "sofa_cama", label: "Sofá-cama" },
  { value: "sofa_retratil", label: "Sofá retrátil" },
  { value: "colchao_chao", label: "Colchão no chão" },
  { value: "berco", label: "Berço" },
] as const;

export const KITCHEN_ITEMS = [
  { value: "air_fryer", label: "Air fryer", icon: "🍟" },
  { value: "fogao", label: "Fogão", icon: "🔥" },
  { value: "geladeira", label: "Geladeira", icon: "❄️" },
  { value: "liquidificador", label: "Liquidificador", icon: "🥤" },
  { value: "sanduicheira", label: "Sanduicheira", icon: "🥪" },
  { value: "cafeteira", label: "Cafeteira elétrica", icon: "☕" },
  { value: "microondas", label: "Microondas", icon: "🍱" },
  { value: "maquina_lavar", label: "Máquina de lavar", icon: "🧺" },
  { value: "lava_loucas", label: "Lava-louças", icon: "🍽️" },
  { value: "forno_eletrico", label: "Forno elétrico", icon: "🥧" },
] as const;

export const SPECIAL_AMENITIES = [
  { value: "piscina", label: "Piscina privativa", icon: "🏊" },
  { value: "sauna", label: "Sauna", icon: "🧖" },
  { value: "churrasqueira", label: "Churrasqueira", icon: "🍖" },
  { value: "jacuzzi", label: "Jacuzzi / hidromassagem", icon: "🛁" },
  { value: "vista_mar", label: "Vista para o mar", icon: "🌊" },
  { value: "vista_montanha", label: "Vista para montanha", icon: "⛰️" },
  { value: "lareira", label: "Lareira", icon: "🔥" },
  { value: "deck", label: "Deck / terraço", icon: "🌅" },
  { value: "jardim", label: "Jardim privativo", icon: "🌿" },
  { value: "home_office", label: "Home office", icon: "💻" },
] as const;

export const CONDO_AMENITIES = [
  { value: "portaria_24h", label: "Portaria 24h", icon: "🛎️" },
  { value: "academia", label: "Academia", icon: "🏋️" },
  { value: "piscina_condo", label: "Piscina do condomínio", icon: "🏊" },
  { value: "sauna_condo", label: "Sauna do condomínio", icon: "🧖" },
  { value: "salao_festas", label: "Salão de festas", icon: "🎉" },
  { value: "playground", label: "Playground", icon: "🎠" },
  { value: "quadra_esportes", label: "Quadra de esportes", icon: "⚽" },
  { value: "churrasqueira_condo", label: "Churrasqueira coletiva", icon: "🍖" },
  { value: "elevador_servico", label: "Elevador de serviço", icon: "🛗" },
  { value: "cameras", label: "Câmeras de segurança", icon: "📹" },
  { value: "cerca_eletrica", label: "Cerca elétrica", icon: "⚡" },
  { value: "praia_proxima", label: "Praia próxima (até 500m)", icon: "🏖️" },
] as const;

export type BedType = typeof BED_TYPES[number]["value"];
export type KitchenItem = typeof KITCHEN_ITEMS[number]["value"];
export type SpecialAmenity = typeof SPECIAL_AMENITIES[number]["value"];
export type CondoAmenity = typeof CONDO_AMENITIES[number]["value"];

export interface BedEntry {
  type: BedType;
  count: number;
}

export interface RoomEntry {
  id: string;
  type: "bedroom" | "living_room";
  name: string;
  floor: number;
  beds: BedEntry[];
  hasAC: boolean;
  hasTV: boolean;
  hasBalcony: boolean;
  hasOutdoorArea: boolean;
}

export interface IntakeFormData {
  // Step 1
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  property_nickname: string;
  property_address: string;
  bedrooms_count: number;
  living_rooms_count: number;
  bathrooms_count: number;
  suites_count: number;
  building_floors: number | null;
  apartment_floor: number | null;
  property_levels: number;
  has_elevator: boolean;
  has_wifi: boolean;
  max_capacity: number;
  parking_spots: number;
  // Step 2
  rooms_data: RoomEntry[];
  // Step 3
  kitchen_items: KitchenItem[];
  special_amenities: SpecialAmenity[];
  // Step 4
  condo_amenities: CondoAmenity[];
  // Step 5
  notes: string;
}
