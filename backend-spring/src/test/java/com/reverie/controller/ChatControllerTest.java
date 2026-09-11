package com.reverie.controller;

import com.reverie.common.ApiException;
import com.reverie.domain.ChatScope;
import com.reverie.dto.ChatAskRequest;
import com.reverie.dto.WorkspaceAskRequest;
import com.reverie.service.ChatService;
import com.reverie.service.RateLimitService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * What it costs to ask, and what it does not cost to tidy up.
 *
 * <h2>Why a burst limit exists here at all</h2>
 *
 * <p>{@code UsageLimitService.requireAiOrThrow} looks like a quota and is not
 * one for chat: it refuses only once the account's transcription minutes are
 * exhausted, and asking a question counts nothing and decrements nothing. So an
 * account inside its allowance can ask without limit, and this is the only
 * thing between a retry storm and an unbounded provider bill.
 *
 * <p><b>One bucket for three endpoints.</b> Meeting, project and workspace chat
 * all reach the same provider through the same path, so a per-endpoint
 * allowance would let a caller triple their throughput by rotating between
 * them. That is the bypass these tests exist to pin, and it is the kind that
 * survives review because each endpoint looks correctly limited on its own.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ChatControllerTest {

    private static final String USER = "usr_1";

    @Mock ChatService chat;
    @Mock RateLimitService rateLimit;

    ChatController controller;

    @BeforeEach
    void setUp() {
        controller = new ChatController(chat, rateLimit);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        USER, null, AuthorityUtils.NO_AUTHORITIES));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static ChatAskRequest ask() {
        return new ChatAskRequest("What did we decide?", null, null);
    }

    @Nested
    @DisplayName("every scope spends from one account-level bucket")
    class OneBucket {

        @Test
        @DisplayName("asking a meeting")
        void meetingAsk() {
            controller.ask("mtg_1", ask());

            verify(rateLimit).checkOrThrow(
                    org.mockito.ArgumentMatchers.eq("ai-chat"),
                    org.mockito.ArgumentMatchers.eq(USER),
                    anyInt(), any(Duration.class));
        }

        @Test
        @DisplayName("asking a project")
        void projectAsk() {
            controller.askProject("prj_1", ask());

            verify(rateLimit).checkOrThrow(
                    org.mockito.ArgumentMatchers.eq("ai-chat"),
                    org.mockito.ArgumentMatchers.eq(USER),
                    anyInt(), any(Duration.class));
        }

        @Test
        @DisplayName("asking the workspace")
        void workspaceAsk() {
            controller.askWorkspace(
                    new WorkspaceAskRequest("What is outstanding?", null, null, null));

            verify(rateLimit).checkOrThrow(
                    org.mockito.ArgumentMatchers.eq("ai-chat"),
                    org.mockito.ArgumentMatchers.eq(USER),
                    anyInt(), any(Duration.class));
        }

        @Test
        @DisplayName("and rotating between all three cannot multiply the allowance")
        void rotatingScopesSharesTheBucket() {
            /*
             * The assertion that matters. Three different endpoints, three
             * different scopes, one bucket name and one user -- so the limiter
             * sees a run of three against the same counter rather than one
             * against each of three.
             */
            controller.ask("mtg_1", ask());
            controller.askProject("prj_1", ask());
            controller.askWorkspace(new WorkspaceAskRequest("q", null, null, null));

            ArgumentCaptor<String> buckets = ArgumentCaptor.forClass(String.class);
            ArgumentCaptor<String> users = ArgumentCaptor.forClass(String.class);
            verify(rateLimit, times(3)).checkOrThrow(
                    buckets.capture(), users.capture(), anyInt(), any(Duration.class));

            assertThat(buckets.getAllValues()).containsExactly("ai-chat", "ai-chat", "ai-chat");
            assertThat(users.getAllValues()).containsExactly(USER, USER, USER);
        }

        @Test
        @DisplayName("the limiter and the service are told about the same person")
        void limiterAndServiceAgreeOnTheUser() {
            // A limit charged to one identity while the work runs as another is
            // not a limit. Resolved once, then passed on.
            controller.ask("mtg_1", ask());

            verify(rateLimit).checkOrThrow(anyString(),
                    org.mockito.ArgumentMatchers.eq(USER), anyInt(), any(Duration.class));
            verify(chat).ask(org.mockito.ArgumentMatchers.eq(USER), anyString(), anyString(),
                    any(), any());
        }
    }

    @Nested
    @DisplayName("a refusal costs nothing")
    class WhenRefused {

        @Test
        @DisplayName("no provider call is made")
        void meetingAskIsNotForwarded() {
            doThrow(ApiException.usageLimitReached("Too many requests; please slow down."))
                    .when(rateLimit).checkOrThrow(anyString(), anyString(), anyInt(),
                            any(Duration.class));

            assertThatThrownBy(() -> controller.ask("mtg_1", ask()))
                    .isInstanceOf(ApiException.class);

            // Checked before the service, so a burst is refused rather than
            // being answered and then refused.
            verifyNoInteractions(chat);
        }

        @Test
        @DisplayName("for the workspace scope too")
        void workspaceAskIsNotForwarded() {
            doThrow(ApiException.usageLimitReached("Too many requests; please slow down."))
                    .when(rateLimit).checkOrThrow(anyString(), anyString(), anyInt(),
                            any(Duration.class));

            assertThatThrownBy(() -> controller.askWorkspace(
                    new WorkspaceAskRequest("q", null, null, null)))
                    .isInstanceOf(ApiException.class);

            verifyNoInteractions(chat);
        }
    }

    @Nested
    @DisplayName("tidying up is not asking")
    class NotRateLimited {

        /*
         * None of these spend a model call. Charging them against the ask
         * budget would mean somebody who renamed a few threads could no longer
         * ask a question -- a limit that fires on the wrong action reads as the
         * product being broken.
         */

        @Test
        @DisplayName("creating a conversation")
        void createConversation() {
            controller.newMeetingConversation("mtg_1");

            verifyNoInteractions(rateLimit);
        }

        @Test
        @DisplayName("renaming one")
        void renameConversation() {
            controller.rename("conv_1", new com.reverie.dto.ConversationRenameRequest("Budget"));

            verifyNoInteractions(rateLimit);
        }

        @Test
        @DisplayName("deleting one")
        void deleteConversation() {
            controller.deleteConversation("conv_1");

            verifyNoInteractions(rateLimit);
        }

        @Test
        @DisplayName("clearing a meeting's history")
        void clearHistory() {
            controller.clearMeetingHistory("mtg_1");

            verifyNoInteractions(rateLimit);
        }

        @Test
        @DisplayName("reading a conversation back")
        void readHistory() {
            controller.history("mtg_1", null);

            verifyNoInteractions(rateLimit);
        }

        @Test
        @DisplayName("listing conversations")
        void listConversations() {
            controller.meetingConversations("mtg_1");

            verify(chat).listConversations(USER, ChatScope.meeting("mtg_1"));
            verifyNoInteractions(rateLimit);
        }
    }

    @Nested
    @DisplayName("the question itself never becomes a limiter key")
    class KeyedByUser {

        @Test
        @DisplayName("only the account and the bucket name are used")
        void neitherQuestionNorMeetingIdIsAKey() {
            /*
             * Two separate reasons. Keying by meeting id would let one account
             * rotate ids to bypass a cost limit, and keying by anything derived
             * from the question would put a transcript fragment in a map that
             * outlives the request.
             */
            controller.ask("mtg_private_789", new ChatAskRequest(
                    "What did we decide about the acquisition?", null, null));

            ArgumentCaptor<String> bucket = ArgumentCaptor.forClass(String.class);
            ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
            verify(rateLimit).checkOrThrow(bucket.capture(), key.capture(), anyInt(),
                    any(Duration.class));

            assertThat(bucket.getValue()).isEqualTo("ai-chat");
            assertThat(key.getValue()).isEqualTo(USER);
            assertThat(key.getValue()).doesNotContain("mtg_private_789");
            assertThat(bucket.getValue() + key.getValue()).doesNotContain("acquisition");
        }
    }

    @Nested
    @DisplayName("there has to be somebody to charge")
    class Unauthenticated {

        @Test
        @DisplayName("an unattributable ask is refused before the provider")
        void refusesWithNoPrincipal() {
            SecurityContextHolder.clearContext();

            assertThatThrownBy(() -> controller.ask("mtg_1", ask()))
                    .isInstanceOf(RuntimeException.class);

            verify(chat, never()).ask(anyString(), anyString(), anyString(), any(), any());
        }
    }
}
