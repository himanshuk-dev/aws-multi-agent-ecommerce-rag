import { Box, Stack, Typography } from '@mui/material';
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center' }} spacing={1.25}>
      <Box
        aria-hidden
        sx={{
          width: 36,
          height: 36,
          borderRadius: '11px',
          bgcolor: light ? '#c8edb4' : 'primary.dark',
          color: light ? 'primary.dark' : '#c8edb4',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: 23,
        }}
      >
        n
      </Box>
      <Typography
        sx={{ fontWeight: 750, fontSize: 23, letterSpacing: '-1px' }}
        color={light ? '#fff' : 'text.primary'}
      >
        nova<span style={{ fontWeight: 400 }}>mart</span>
        <span style={{ color: light ? '#c8edb4' : '#6b8a65' }}>.</span>
      </Typography>
    </Stack>
  );
}
