import type { ReactNode } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowOutward,
  DashboardOutlined,
  HeadsetMicOutlined,
  Inventory2Outlined,
  LogoutOutlined,
  SpaOutlined,
} from '@mui/icons-material';
import { Brand } from './Brand';
import { useAuth } from '../features/auth/AuthProvider';
export type PortalView = 'overview' | 'orders' | 'support';
const navigation = [
  { id: 'overview', label: 'Overview', icon: DashboardOutlined },
  { id: 'orders', label: 'My orders', icon: Inventory2Outlined },
  { id: 'support', label: 'Help & support', icon: HeadsetMicOutlined },
] as const;
export function AppShell({
  view,
  onNavigate,
  children,
}: {
  view: PortalView;
  onNavigate(view: PortalView): void;
  children: ReactNode;
}) {
  const { customer, logout, mode } = useAuth();
  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', flexDirection: { xs: 'column', md: 'row' } }}>
      <Box
        component="aside"
        sx={{
          width: { md: 235, xl: 255 },
          flexShrink: 0,
          bgcolor: '#fff',
          borderRight: { md: '1px solid' },
          borderBottom: { xs: '1px solid', md: 'none' },
          borderColor: 'divider',
          p: { xs: 2, md: 3 },
          position: { md: 'sticky' },
          top: 0,
          height: { md: '100dvh' },
          display: 'flex',
          flexDirection: 'column',
          zIndex: 2,
        }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Brand />
          <Tooltip title="Sign out">
            <IconButton
              aria-label="Sign out"
              onClick={() => void logout()}
              sx={{ display: { md: 'none' } }}
            >
              <LogoutOutlined />
            </IconButton>
          </Tooltip>
        </Stack>
        <Typography
          variant="overline"
          sx={{
            fontSize: 9,
            letterSpacing: 2,
            color: 'text.secondary',
            mt: 1,
            ml: 6,
            display: { xs: 'none', md: 'block' },
          }}
        >
          CUSTOMER CARE
        </Typography>
        <Box
          component="nav"
          aria-label="Main navigation"
          sx={{
            mt: { xs: 2, md: 5 },
            display: 'flex',
            gap: 0.75,
            flexDirection: { xs: 'row', md: 'column' },
          }}
        >
          {navigation.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              onClick={() => onNavigate(id)}
              aria-current={view === id ? 'page' : undefined}
              startIcon={<Icon sx={{ fontSize: 19 }} />}
              sx={{
                justifyContent: { xs: 'center', md: 'flex-start' },
                flex: { xs: 1, md: 'initial' },
                py: 1.6,
                px: { xs: 1, md: 2 },
                color: view === id ? 'primary.main' : 'text.secondary',
                bgcolor: view === id ? '#eaf0e4' : 'transparent',
                fontSize: { xs: 11, sm: 13 },
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </Button>
          ))}
        </Box>
        <Box sx={{ mt: 'auto', display: { xs: 'none', md: 'block' } }}>
          <Box sx={{ p: 2.5, borderRadius: '16px', bgcolor: '#f3f5eb', mb: 3 }}>
            <SpaOutlined sx={{ color: '#688459', mb: 1 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 650 }}>A little extra, for you.</Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              component="p"
              sx={{ mt: 1, lineHeight: 1.7 }}
            >
              Get help with your orders and membership.
            </Typography>
            <Button
              size="small"
              onClick={() => onNavigate('support')}
              sx={{ p: 0, mt: 1.5, fontSize: 11 }}
              endIcon={<ArrowOutward sx={{ fontSize: 13 }} />}
            >
              Explore your benefits
            </Button>
          </Box>
          <Divider />
          <Stack direction="row" spacing={1.25} sx={{ pt: 2.5, alignItems: 'center' }}>
            <Avatar
              sx={{ width: 34, height: 34, bgcolor: '#e8e2d7', color: '#6a6253', fontSize: 13 }}
            >
              {customer?.name
                .split(' ')
                .slice(0, 2)
                .map((part) => part[0])
                .join('')}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 650 }}>{customer?.name}</Typography>
              <Chip
                size="small"
                label={customer?.tier}
                sx={{ height: 18, fontSize: 9, bgcolor: '#edf2e0' }}
              />
            </Box>
            <Tooltip title="Sign out">
              <IconButton aria-label="Sign out" size="small" onClick={() => void logout()}>
                <LogoutOutlined sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          component="header"
          sx={{
            px: { xs: 3, lg: 5 },
            py: 2.25,
            bgcolor: '#ffffff80',
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Typography sx={{ fontSize: 12 }} color="text.secondary">
            Your account{' '}
            <Box component="span" sx={{ mx: 1.2, color: '#b5bdb1' }}>
              /
            </Box>
            <Box component="span" sx={{ color: 'text.primary' }}>
              {navigation.find((n) => n.id === view)?.label}
            </Box>
          </Typography>
          <Chip
            label={mode === 'demo' ? 'LOCAL DEMO' : 'LIVE AGENT'}
            size="small"
            variant="outlined"
            sx={{ fontSize: 9, letterSpacing: 1.1, height: 23, bgcolor: '#fff' }}
          />
        </Box>
        <Box component="main" sx={{ p: { xs: 2.5, sm: 4, lg: 5 }, maxWidth: 1700, mx: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
