/** Transport contracts shared by feature hooks; presentation never fetches directly. */
export interface Customer {
  id: string;
  name: string;
  email: string;
  tier: string;
}
export interface OrderEvent {
  label: string;
  date: string;
  complete: boolean;
}
export interface Order {
  id: string;
  product: string;
  category: string;
  quantity: number | null;
  price: number | null;
  status:
    | 'in_transit'
    | 'delivered'
    | 'return_requested'
    | 'processing'
    | 'shipped'
    | 'cancelled'
    | 'unknown';
  placedAt: string | null;
  deliveryDate: string | null;
  deliveryDateKind?: 'estimated' | 'delivered';
  trackingNumber: string | null;
  destination: string | null;
  events: OrderEvent[];
}
export interface ChatReply {
  reply: string;
  sessionId: string;
}
export interface PortalService {
  info(signal?: AbortSignal): Promise<{ mode: 'demo' | 'agentcore'; testLogin?: boolean }>;
  currentCustomer(signal?: AbortSignal): Promise<Customer>;
  login(email: string, password: string): Promise<Customer>;
  loginTestAccount?(): Promise<Customer>;
  logout(): Promise<void>;
  orders(signal?: AbortSignal): Promise<Order[]>;
  chat(message: string, sessionId: string, signal?: AbortSignal): Promise<ChatReply>;
}
