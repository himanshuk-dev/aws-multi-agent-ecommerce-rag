import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { ArrowUpward, AutoAwesomeOutlined, RestartAlt, ShieldOutlined } from '@mui/icons-material';
import { useChat } from './useChat';
import { useAuth } from '../auth/AuthProvider';

export function ChatPanel({
  draft,
  onDraftConsumed,
}: {
  draft: { text: string; key: number } | null;
  onDraftConsumed(): void;
}) {
  const { mode } = useAuth();
  const { messages, busy, error, send, reset } = useChat();
  const [input, setInput] = useState('');
  const conversation = useRef<HTMLDivElement>(null);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const composer = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const element = conversation.current;
    element?.scrollTo?.({ top: element.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [messages, busy, reduceMotion]);
  useEffect(() => {
    if (!draft) return;
    setInput(draft.text);
    composer.current?.focus();
    onDraftConsumed();
  }, [draft, onDraftConsumed]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy) return;
    const sent = await send(input);
    if (sent) setInput('');
  }
  return (
    <Paper
      component="section"
      aria-labelledby="chat-title"
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 600,
        height: { xs: 650, xl: 720 },
        overflow: 'hidden',
        position: { lg: 'sticky' },
        top: 28,
      }}
    >
      <Stack
        direction="row"
        sx={{
          p: 2.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Avatar sx={{ bgcolor: '#e4edda', color: 'primary.main', width: 42, height: 42 }}>
            <AutoAwesomeOutlined sx={{ fontSize: 'small' }} />
          </Avatar>
          <Box>
            <Typography id="chat-title" component="h2" sx={{ fontSize: 16, fontWeight: 700 }}>
              A little help from Nova
            </Typography>
            <Typography variant="caption" color="text.secondary">
              <Box
                component="span"
                sx={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: '#6c9164',
                  mr: 0.7,
                }}
              />
              {mode === 'demo' ? 'Local demo assistant' : 'Project agent · AgentCore Runtime'}
            </Typography>
          </Box>
        </Stack>
        <Tooltip title="Start a new conversation">
          <span>
            <IconButton aria-label="Start a new conversation" onClick={reset} disabled={busy}>
              <RestartAlt sx={{ fontSize: 'small' }} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Box
        sx={{
          px: 2.5,
          py: 1.2,
          bgcolor: '#fafbf6',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {mode === 'demo'
            ? 'Scripted demo · sample orders · no live AI or AWS calls'
            : 'Live model response · requests may take a minute'}
        </Typography>
      </Box>
      <Box
        ref={conversation}
        role="log"
        aria-label="Conversation with Nova"
        aria-live="polite"
        aria-relevant="additions"
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2.5, overscrollBehavior: 'contain' }}
      >
        {messages.map((message) => (
          <Box
            key={message.id}
            sx={{
              mb: 2.5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.7, px: 0.5 }}>
              {message.role === 'user' ? 'You' : 'Nova'}
            </Typography>
            <Box
              sx={{
                p: 2,
                borderRadius: message.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                bgcolor: message.role === 'user' ? 'primary.main' : '#f2f4ee',
                color: message.role === 'user' ? '#fff' : 'text.primary',
                maxWidth: '95%',
              }}
            >
              <Typography
                variant="body2"
                sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.8 }}
              >
                {message.content}
              </Typography>
            </Box>
          </Box>
        ))}
        {messages.length === 1 && (
          <Stack spacing={1} sx={{ mt: 2, alignItems: 'flex-start' }}>
            {(mode === 'demo'
              ? ['Where is DEMO-1042?', 'What is the return window?', 'Track DEMO-1038']
              : ['Show my orders', 'What is the return policy?', 'What are the warranty terms?']
            ).map((question) => (
              <Chip
                key={question}
                label={question}
                variant="outlined"
                onClick={() => setInput(question)}
                sx={{ bgcolor: '#fff', fontSize: 12, maxWidth: '100%' }}
              />
            ))}
          </Stack>
        )}
        {busy && (
          <Stack role="status" direction="row" spacing={1} sx={{ my: 2, alignItems: 'center' }}>
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.secondary">
              {mode === 'demo'
                ? 'Nova is checking the demo details…'
                : 'Your project agent is working…'}
            </Typography>
          </Stack>
        )}
      </Box>
      <Box component="form" onSubmit={submit} sx={{ p: 2, pt: 0 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}
        <Paper
          variant="outlined"
          sx={{ p: 1.2, borderRadius: '16px', '&:focus-within': { borderColor: 'primary.main' } }}
        >
          <TextField
            fullWidth
            multiline
            maxRows={4}
            inputRef={composer}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your order…"
            disabled={busy}
            variant="standard"
            slotProps={{
              htmlInput: { 'aria-label': 'Message Nova', maxLength: 2000 },
              input: { disableUnderline: true },
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit(event);
              }
            }}
          />
          <Stack
            direction="row"
            sx={{ mt: 1, justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Typography variant="caption" color="text.secondary">
              {input.length}/2,000
            </Typography>
            <Button
              type="submit"
              aria-label="Send message"
              variant="contained"
              disabled={busy || !input.trim()}
              sx={{ minWidth: 34, width: 34, height: 34, borderRadius: '10px', p: 0 }}
            >
              <ArrowUpward sx={{ fontSize: 18 }} />
            </Button>
          </Stack>
        </Paper>
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ mt: 1.25, justifyContent: 'center', alignItems: 'center' }}
        >
          <ShieldOutlined sx={{ color: 'text.secondary', fontSize: 12 }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
            Please don’t share passwords or payment details.
          </Typography>
        </Stack>
      </Box>
    </Paper>
  );
}
