package com.reverie.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reverie.domain.ChatMode;
import com.reverie.entity.ChatConversation;
import com.reverie.entity.ChatMessage;
import com.reverie.entity.Meeting;
import com.reverie.entity.UserEntity;
import com.reverie.repository.ChatConversationRepository;
import com.reverie.repository.ChatMessageRepository;
import com.reverie.repository.MeetingRepository;
import com.reverie.repository.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Where the database transaction ends and the model call begins.
 *
 * <h2>What was wrong</h2>
 *
 * <p>Asking was one {@code @Transactional} method with the AI call in the
 * middle of it, so a connection stayed checked out of the pool for the whole of
 * retrieval, embedding, the provider's own retries and the generation. Under
 * anything but a fast ai-service that turns a chat feature into a database
 * outage for the rest of the application: ten simultaneous slow questions hold
 * ten connections, and the slower the ai-service gets the more of the pool it
 * takes.
 *
 * <h2>What must not have changed with it</h2>
 *
 * <p>The single transaction had a property worth keeping. When the AI call
 * failed, everything rolled back — the conversation, the question, all of it —
 * so a failed question left no trace. Splitting the transaction naively loses
 * that and leaves a permanent unanswered question in the thread, or an empty
 * untitled conversation in the sidebar for every outage. Both are asserted
 * here, because both are the kind of regression that looks like nothing in a
 * diff.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ChatTransactionBoundaryTest {

    private static final String USER = "usr_1";
    private static final String MEETING = "mtg_1";

    @Mock private ChatMessageRepository messages;
    @Mock private ChatConversationRepository conversations;
    @Mock private MeetingRepository meetings;
    @Mock private ProjectRepository projects;
    @Mock private AiClient ai;
    @Mock private UserService users;
    @Mock private UsageLimitService usage;
    @Mock private PlatformTransactionManager transactions;

    private ChatService service;
    private final List<ChatConversation> stored = new ArrayList<>();
    private final List<ChatMessage> turns = new ArrayList<>();

    @BeforeEach
    void setUp() {
        service = new ChatService(messages, conversations, meetings, projects, ai, users, usage,
                new ObjectMapper(), transactions);

        when(users.require(anyString())).thenReturn(new UserEntity());

        Meeting meeting = new Meeting();
        meeting.setId(MEETING);
        meeting.setUserId(USER);
        when(meetings.findByIdAndUserId(anyString(), anyString())).thenAnswer(inv ->
                USER.equals(inv.getArgument(1)) ? Optional.of(meeting) : Optional.empty());

        when(conversations.save(any())).thenAnswer(inv -> {
            ChatConversation c = inv.getArgument(0);
            stored.add(c);
            return c;
        });
        when(conversations.findByIdAndUserId(anyString(), anyString())).thenAnswer(inv ->
                stored.stream()
                        .filter(c -> c.getId().equals(inv.getArgument(0)))
                        .findFirst());
        when(messages.save(any())).thenAnswer(inv -> {
            ChatMessage m = inv.getArgument(0);
            turns.add(m);
            return m;
        });
        when(messages.findByConversationIdOrderByCreatedAtAsc(anyString()))
                .thenReturn(List.of());
    }

    private void aiAnswers() {
        when(ai.chat(anyString(), anyString(), anyString(), any(ChatMode.class), any()))
                .thenReturn(new AiClient.ChatResult("An answer.", List.of()));
        when(ai.workspaceChat(anyString(), anyString(), any(), any(), any(), any()))
                .thenReturn(new AiClient.ChatResult("An answer.", List.of()));
    }

    @Nested
    @DisplayName("the model call is not inside a transaction")
    class TheBoundary {

        @Test
        @DisplayName("the first transaction is committed before the question is sent")
        void committedBeforeAsking() {
            aiAnswers();

            service.ask(USER, MEETING, "What did we decide?", null, ChatMode.QUICK);

            /*
             * The assertion that matters, and the reason it is about ordering
             * rather than about `isActualTransactionActive()`: with a mocked
             * transaction manager nothing is ever really active, so that check
             * would pass whether or not this had been fixed. A commit that
             * precedes the AI call proves the boundary exists.
             */
            InOrder order = inOrder(transactions, ai);
            order.verify(transactions).commit(any());
            order.verify(ai).chat(anyString(), anyString(), anyString(), any(), any());
            order.verify(transactions).getTransaction(any());
        }

        @Test
        @DisplayName("and a second one opens afterwards to write the answer")
        void writesInASecondTransaction() {
            aiAnswers();

            service.ask(USER, MEETING, "What did we decide?", null, ChatMode.QUICK);

            // Two transactions, not one wrapped around everything.
            verify(transactions, org.mockito.Mockito.times(2)).getTransaction(any());
            verify(transactions, org.mockito.Mockito.times(2)).commit(any());
        }

        @Test
        @DisplayName("the same holds for a workspace question")
        void workspaceToo() {
            aiAnswers();

            service.askWorkspace(USER, "What is outstanding?", null, null, ChatMode.QUICK);

            InOrder order = inOrder(transactions, ai);
            order.verify(transactions).commit(any());
            order.verify(ai).workspaceChat(anyString(), anyString(), any(), any(), any(), any());
        }
    }

    @Nested
    @DisplayName("a failed question still leaves no trace")
    class WhenTheAiFails {

        @Test
        @DisplayName("neither turn is written")
        void nothingIsPersisted() {
            // The property the single transaction used to give for free. A
            // question saved before the call and an answer that never arrives
            // reads as the model having failed mid-thought, permanently.
            when(ai.chat(anyString(), anyString(), anyString(), any(), any()))
                    .thenThrow(new RuntimeException("ai-service did not respond"));

            assertThatThrownBy(() ->
                    service.ask(USER, MEETING, "What did we decide?", null, ChatMode.QUICK))
                    .isInstanceOf(RuntimeException.class);

            assertThat(turns).isEmpty();
            verify(messages, never()).save(any());
        }

        @Test
        @DisplayName("and no empty conversation is left in the sidebar")
        void noOrphanConversation() {
            // Why `prepare` resolves a conversation but never creates one: the
            // thread is created in the same transaction as the turns, so an
            // outage does not leave an untitled empty conversation behind for
            // every attempt.
            when(ai.chat(anyString(), anyString(), anyString(), any(), any()))
                    .thenThrow(new RuntimeException("ai-service did not respond"));

            assertThatThrownBy(() ->
                    service.ask(USER, MEETING, "What did we decide?", null, ChatMode.QUICK))
                    .isInstanceOf(RuntimeException.class);

            assertThat(stored).isEmpty();
        }
    }

    @Nested
    @DisplayName("the allowance is still spent first")
    class TheAllowance {

        @Test
        @DisplayName("refused before the question reaches the model")
        void checkedBeforeTheCall() {
            // Ordering that predates this change and must survive it: a turn
            // written and then refused leaves a thread whose last line is an
            // unanswered question.
            org.mockito.Mockito.doThrow(new RuntimeException("out of allowance"))
                    .when(usage).requireAiOrThrow(anyString(), any());

            assertThatThrownBy(() ->
                    service.ask(USER, MEETING, "What did we decide?", null, ChatMode.QUICK))
                    .isInstanceOf(RuntimeException.class);

            verify(ai, never()).chat(anyString(), anyString(), anyString(), any(), any());
            assertThat(turns).isEmpty();
        }
    }
}
