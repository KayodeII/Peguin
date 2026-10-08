# The same lines for every model: the real shapes Peguin speaks.
# The owner's name comes from PEGUIN_NAME (default Mujeeb).
import os

NAME = os.environ.get("PEGUIN_NAME", "Mujeeb")

LINES = {
    "1-update": (
        f"Hi everyone, I'm Peguin, {NAME}'s AI assistant, speaking in {NAME}'s voice. {NAME} is in another meeting, "
        f"so I'm covering the update. Yesterday {NAME} merged the payment webhook retries and fixed the flaky "
        f"invoice test. Today {NAME} is migrating the users table to the new auth schema. No blockers."
    ),
    "2-answer": f"It's in progress. There's no date yet, so I'll get {NAME} to follow up.",
    "3-defer": f"I don't have that one. {NAME} will follow up after the call.",
    "4-ack": "Thanks, will do.",
    # The same update written for the ear: short sentences, no noun stacks.
    "6-update-spoken": (
        f"Hi everyone, I'm Peguin, {NAME}'s AI assistant, speaking in {NAME}'s voice. {NAME} is in another meeting, "
        f"so I'm covering the update. Yesterday, {NAME} added retries for payment webhooks. {NAME} also fixed the flaky "
        f"invoice test. Today, {NAME} is moving the users table over to the new login system. No blockers."
    ),
    "5-numbers": "Pull request four eighty-two is merged, and the migration is at step one of three.",
}
