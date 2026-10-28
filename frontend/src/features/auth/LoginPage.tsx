import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  ArrowForward,
  AutoAwesomeOutlined,
  LocalShippingOutlined,
  LockOutlined,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { Brand } from '../../components/Brand';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { login, error, mode } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await login(email, password);
    } catch {
      /* AuthProvider owns the error. */
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
      }}
    >
      <Box
        sx={{
          bgcolor: 'primary.dark',
          color: 'white',
          p: { xs: 3, md: 4, lg: 7 },
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Brand light />
        <Box
          sx={{
            maxWidth: 520,
            my: { xs: 2, md: 'auto' },
            py: { md: 7 },
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Chip
            icon={<AutoAwesomeOutlined />}
            label="A little help. A lot less hassle."
            sx={{
              display: { xs: 'none', md: 'inline-flex' },
              color: '#d8e8bd',
              bgcolor: '#ffffff10',
              mb: 3,
              '& .MuiChip-icon': { color: '#c8edb4' },
            }}
          />
          <Typography
            component="h1"
            variant="h1"
            sx={{ fontSize: { xs: 32, md: 44, lg: 64 }, lineHeight: 1.08 }}
          >
            Good things.
            <br />
            Great support.
          </Typography>
          <Typography
            sx={{
              display: { xs: 'none', md: 'block' },
              color: '#b6cbbf',
              fontSize: 18,
              lineHeight: 1.8,
              mt: 3,
              maxWidth: 390,
            }}
          >
            From “where’s my order?” to “what happens next?”, your NovaMart care team is right here.
          </Typography>
          <Paper
            sx={{
              display: { xs: 'none', md: 'block' },
              mt: 5,
              p: 3,
              bgcolor: '#ffffff0c',
              border: '1px solid #ffffff20',
              color: 'white',
              maxWidth: 390,
              backdropFilter: 'blur(10px)',
            }}
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Box
                sx={{
                  bgcolor: '#c8edb4',
                  color: 'primary.dark',
                  p: 1.2,
                  borderRadius: '16px',
                  display: 'flex',
                }}
              >
                <LocalShippingOutlined />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 600 }}>Your orders, all in one place</Typography>
                <Typography variant="body2" sx={{ color: '#b6cbbf', mt: 0.5 }}>
                  Track every step. Ask anything.
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Box>
        <Typography
          variant="caption"
          sx={{ display: { xs: 'none', md: 'block' }, color: '#b6cbbf', zIndex: 1 }}
        >
          NovaMart customer care · {mode === 'demo' ? 'Local demo' : 'Project AgentCore Runtime'}
        </Typography>
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            width: 650,
            height: 650,
            border: '1px solid #c8edb420',
            borderRadius: '50%',
            bottom: -430,
            right: -200,
            boxShadow: '0 0 0 70px #c8edb407, 0 0 0 140px #c8edb405',
          }}
        />
      </Box>
      <Container
        maxWidth="sm"
        sx={{ display: 'flex', alignItems: 'center', p: { xs: 3, sm: 6 }, py: { xs: 4, md: 6 } }}
      >
        <Box component="form" onSubmit={submit} sx={{ width: '100%' }}>
          <Chip
            label="CUSTOMER PORTAL"
            size="small"
            sx={{ bgcolor: '#e8edde', fontSize: 10, letterSpacing: 1.7, mb: 3 }}
          />
          <Typography component="h2" variant="h2" sx={{ fontSize: 36 }}>
            Welcome back.
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 4 }}>
            Sign in to your orders and a little peace of mind.
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Stack spacing={2.5}>
            <TextField
              label="Email address"
              type="email"
              autoComplete="username"
              required
              fullWidth
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              slotProps={{ htmlInput: { maxLength: 254 } }}
            />
            <TextField
              label="Password"
              type={visible ? 'text' : 'password'}
              autoComplete="current-password"
              required
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              slotProps={{
                htmlInput: { maxLength: 128 },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={visible ? 'Hide password' : 'Show password'}
                        onClick={() => setVisible(!visible)}
                        edge="end"
                      >
                        {visible ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={busy}
              endIcon={busy ? <CircularProgress size={18} color="inherit" /> : <ArrowForward />}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </Stack>
          <Stack
            direction="row"
            spacing={0.75}
            sx={{ my: 2.5, color: 'text.secondary', justifyContent: 'center' }}
          >
            <LockOutlined sx={{ fontSize: 15 }} />
            <Typography variant="caption">
              Local login · AWS credentials stay on the server
            </Typography>
          </Stack>
          {mode === 'demo' && <Divider sx={{ my: 3 }} />}
          {mode === 'demo' ? (
            <Paper variant="outlined" sx={{ p: 2.5, bgcolor: '#fafbf6' }}>
              <Typography sx={{ fontWeight: 650 }} variant="body2">
                Just exploring? Try the demo.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Use fictional orders and a scripted assistant. No real customer data, AI inference,
                or AWS calls.
              </Typography>
              <Typography variant="caption" component="p" sx={{ mt: 1.5, fontFamily: 'monospace' }}>
                demo@novamart.local · NovaMartDemo!
              </Typography>
              <Button
                size="small"
                onClick={() => {
                  setEmail('demo@novamart.local');
                  setPassword('NovaMartDemo!');
                }}
                disabled={busy}
                sx={{ mt: 1, px: 0 }}
              >
                Fill demo credentials <ArrowForward sx={{ fontSize: 16, ml: 1 }} />
              </Button>
            </Paper>
          ) : (
            <Alert severity="info">
              Sign in with your private local portal account. Customer identity is mapped on the
              server. Responses come from your deployed project agent.
            </Alert>
          )}
        </Box>
      </Container>
    </Box>
  );
}
