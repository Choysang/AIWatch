// better-auth mounts all its endpoints (sign-in, sign-out, session, ...) here.
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/auth/auth";

export const { GET, POST } = toNextJsHandler(auth);
