sed -i -e '3a\
import { db } from "../firebase";\
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";\
import firebaseConfig from "../../firebase-applet-config.json";' src/components/AuditLogs.tsx
