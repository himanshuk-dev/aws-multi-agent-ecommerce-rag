/** Transport contracts shared by feature hooks; presentation never fetches directly. */
export interface Customer {
  id: string;
  name: string;
  email: string;
  tier: 'Premium' | 'Standard';
}
export interface OrderEvent { label: string; date: string; complete: boolean }
export interface Order {
  id: string;
  product: string;
  category: string;
  quantity: number;
  price: number;
  status: 'in_transit' | 'delivered' | 'return_requested';
  placedAt: string;
  deliveryDate: string;
  trackingNumber: string;
  destination: string;
  events: OrderEvent[];
}
export interface ChatReply { reply: string; sessionId: string }
export interface PortalService {
  currentCustomer(signal?: AbortSignal): Promise<Customer>;
  login(email: string, password: string): Promise<Customer>;
  logout(): Promise<void>;
  orders(signal?: AbortSignal): Promise<Order[]>;
  chat(message: string, sessionId: string, signal?: AbortSignal): Promise<ChatReply>;
}
